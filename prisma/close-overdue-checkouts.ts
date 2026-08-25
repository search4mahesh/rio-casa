/**
 * Close out stays the front desk never checked out.
 *
 *   npx tsx prisma/close-overdue-checkouts.ts            # report only
 *   npx tsx prisma/close-overdue-checkouts.ts --apply    # write the changes
 *
 * B-51. Every query that looked at a `checked_in` booking matched the checkout
 * day exactly, so a checkout nobody pressed dropped off the desk's list at
 * midnight and was never mentioned again. `runNightAudit` now uses an
 * open-ended `checkOut: { lte: today }` and these reappear daily — but that
 * only surfaces them. This is the tool for a backlog that has already built up.
 *
 * ─────────────────────────────────────────────────────────────
 * Why this exists instead of just pressing "Check out" in the admin panel
 * ─────────────────────────────────────────────────────────────
 * The check-out route stamps `actualCheckout: new Date()` and
 * `generateInvoice` dates both the invoice number and `invoiceDate` from
 * `today()`. Pushing a stay that ended on 26 May through the UI in August
 * therefore issues a tax invoice dated August for a May supply. GSTR-1 is
 * filed monthly and the invoice date decides which return it lands in, so the
 * period would be misstated — and `generateInvoice` is idempotent by design,
 * so it cannot simply be reissued with the right date afterwards.
 *
 * This script backdates `actualCheckout` to the booking's own `checkOut` day
 * and **deliberately writes no invoices**. `prisma/backfill-invoices.ts`
 * already dates an invoice from `booking.checkOut` and allocates its number
 * from that day's counter; it only ever skipped these because it selects
 * `status: "checked_out"`. Closing them here is what brings them into its
 * range.
 *
 * **Have whoever files the GST returns look at the dry run before `--apply`.**
 * Nothing here writes an invoice, but it is the step that makes six of them
 * issuable, and the dates matter.
 *
 * ─────────────────────────────────────────────────────────────
 * The order to run things in
 * ─────────────────────────────────────────────────────────────
 *   1. this script --apply           close the bookings
 *   2. backfill-invoices.ts --apply  issue their invoices, correctly backdated
 *   3. repair-data.ts --apply        free the rooms they were holding
 *
 * Step 3 is a separate tool on purpose. Once these bookings are no longer
 * `checked_in`, `repairStaleCheckinFlags` can see their rooms — it skips any
 * room with a guest checked into it, which is exactly what these were.
 *
 * Idempotent: a second run finds nothing, because it selects on
 * `status: "checked_in"`.
 */
import { makeScriptClient } from "./script-client";
import { today as todayDate, toDayString, daysBetween } from "../lib/dates";

const prisma = makeScriptClient();
const APPLY = process.argv.includes("--apply");

/**
 * Stays older than this are closed without argument; anything more recent is
 * listed but left alone, because the guest may simply still be in the room and
 * the desk is the only thing that knows.
 */
const MIN_DAYS_OVERDUE = Number(
  process.argv.find((a) => a.startsWith("--min-days="))?.split("=")[1] ?? 2
);

async function main() {
  console.log(APPLY ? "CLOSING (writing changes)" : "DRY RUN — pass --apply to write changes");
  console.log(`Treating a stay as abandoned after ${MIN_DAYS_OVERDUE} day(s) overdue.\n`);

  const today = todayDate();

  const overdue = await prisma.booking.findMany({
    where: { status: "checked_in", checkOut: { lt: today } },
    select: {
      id: true, bookingNumber: true, guestName: true, source: true,
      checkIn: true, checkOut: true, totalAmount: true, paymentStatus: true,
      room: { select: { roomNumber: true, name: true } },
    },
    orderBy: { checkOut: "asc" },
  });

  if (overdue.length === 0) {
    console.log("No stays are past their checkout date. Nothing to do.");
    return;
  }

  const stale = overdue.filter((b) => daysBetween(b.checkOut, today) >= MIN_DAYS_OVERDUE);
  const recent = overdue.filter((b) => daysBetween(b.checkOut, today) < MIN_DAYS_OVERDUE);

  console.log(`${overdue.length} stay(s) still "checked_in" past their checkout date:\n`);
  for (const b of overdue) {
    const days = daysBetween(b.checkOut, today);
    const mark = days >= MIN_DAYS_OVERDUE ? "close " : "SKIP  ";
    console.log(
      `  ${mark} ${b.bookingNumber}  #${b.room.roomNumber ?? "—"}  out ${toDayString(b.checkOut)} ` +
        `(${days}d ago)  ₹${b.totalAmount.toLocaleString("en-IN")} ${b.paymentStatus}  ${b.guestName} [${b.source}]`
    );
  }

  if (recent.length > 0) {
    console.log(
      `\n${recent.length} left alone — under ${MIN_DAYS_OVERDUE} day(s) overdue, so the guest may still be in the room.`
    );
  }

  if (!APPLY) {
    console.log(`\nNothing written. Re-run with --apply to close ${stale.length} stay(s).`);
    console.log("Then: backfill-invoices.ts --apply, then repair-data.ts --apply.");
    return;
  }

  let closed = 0;
  for (const b of stale) {
    // `actualCheckout` is set to the booking's own departure day, not now.
    // The time of day is not known and is not invented — this records which
    // day the stay ended, which is what the invoice will be dated from.
    await prisma.$transaction([
      prisma.booking.update({
        where: { id: b.id },
        data: { status: "checked_out", actualCheckout: b.checkOut },
      }),
      prisma.auditLog.create({
        data: {
          userId: "system",
          action: "booking_closed_overdue_checkout",
          entityType: "booking",
          entityId: b.id,
          oldValue: { status: "checked_in" },
          newValue: {
            bookingNumber: b.bookingNumber,
            status: "checked_out",
            actualCheckout: toDayString(b.checkOut),
            daysOverdue: daysBetween(b.checkOut, today),
            note: "Closed by prisma/close-overdue-checkouts.ts — departure date backdated, no invoice written",
          },
        },
      }),
    ]);
    closed++;
    console.log(`  closed ${b.bookingNumber} (actualCheckout ${toDayString(b.checkOut)})`);
  }

  console.log(`\nClosed ${closed} stay(s). No invoices were written and no rooms were touched.`);
  console.log("Next:  npx tsx prisma/backfill-invoices.ts        # check, then --apply");
  console.log("Then:  npx tsx prisma/repair-data.ts              # check, then --apply");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
