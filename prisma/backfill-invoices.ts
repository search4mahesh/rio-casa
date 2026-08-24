/**
 * One-off backfill for stays that completed before invoice generation
 * existed at all (see B-28 in BUGS.md — no code path ever called
 * `prisma.invoice.create`, so every already-checked-out, already-paid
 * booking has no invoice and never will on its own).
 *
 * `lib/invoice-service.ts` now generates one at check-out going forward;
 * this script catches up everything checked out before that existed.
 *
 * Idempotent — safe to run repeatedly. Skips any booking that already has an
 * invoice (checked per row, not just via `--apply`), so a partial run or a
 * booking checked out for real in the meantime can't double-bill a stay.
 *
 *   npx tsx prisma/backfill-invoices.ts            # report only
 *   npx tsx prisma/backfill-invoices.ts --apply    # write the invoices
 *
 * Deliberately its own queries against its own script client rather than
 * importing generateInvoice from lib/invoice-service.ts — that module pulls
 * in @/lib/prisma, the app's singleton, which reads DATABASE_URL at import
 * time and is not meant to run outside the Next.js process. See
 * prisma/script-client.ts and prisma/repair-data.ts for the same call.
 */
import { makeScriptClient } from "./script-client";

const prisma = makeScriptClient();
const APPLY = process.argv.includes("--apply");

async function main() {
  const candidates = await prisma.booking.findMany({
    where: {
      status: "checked_out",
      paymentStatus: { in: ["paid", "cash"] },
      invoices: { none: {} },
    },
    include: { room: true, guest: true },
    orderBy: { checkOut: "asc" },
  });

  if (candidates.length === 0) {
    console.log("Nothing to backfill — every paid, checked-out booking already has an invoice.");
    return;
  }

  console.log(`${candidates.length} paid, checked-out booking(s) with no invoice.`);

  let created = 0;
  let skipped = 0;

  for (const booking of candidates) {
    if (!booking.guestId || !booking.guest) {
      console.log(`  SKIP ${booking.bookingNumber} — no guest on file`);
      skipped++;
      continue;
    }

    const cgstAmount = booking.cgstAmount ?? 0;
    const sgstAmount = booking.sgstAmount ?? 0;
    const taxableAmount = booking.totalAmount - cgstAmount - sgstAmount;
    const subtotal = taxableAmount + booking.discountAmount;
    const cgstRate = taxableAmount > 0 ? Math.round((cgstAmount / taxableAmount) * 10000) / 100 : 0;
    const sgstRate = taxableAmount > 0 ? Math.round((sgstAmount / taxableAmount) * 10000) / 100 : 0;

    const guestAddress =
      [booking.guest.address, [booking.guest.city, booking.guest.state, booking.guest.pincode].filter(Boolean).join(", ")]
        .filter(Boolean)
        .join("\n") || null;

    if (!APPLY) {
      console.log(`  WOULD CREATE invoice for ${booking.bookingNumber} — ₹${booking.totalAmount}`);
      created++;
      continue;
    }

    // Same one-row-per-(scope,day) upsert every other document number in
    // this project uses — see nextDailyNumber in lib/booking-service.ts.
    // Backdated to the booking's own check-out day, not today, so invoice
    // numbers stay in the order stays actually completed rather than all
    // landing on the day this script happened to run.
    const day = new Date(Date.UTC(
      booking.checkOut.getUTCFullYear(),
      booking.checkOut.getUTCMonth(),
      booking.checkOut.getUTCDate()
    ));
    const [{ last_seq }] = await prisma.$queryRaw<Array<{ last_seq: number }>>`
      INSERT INTO daily_counters (scope, day, last_seq)
      VALUES ('invoice', ${day}::date, 1)
      ON CONFLICT (scope, day) DO UPDATE SET last_seq = daily_counters.last_seq + 1
      RETURNING last_seq
    `;
    const invoiceNumber = `INV-${day.toISOString().slice(0, 10).replace(/-/g, "")}-${String(last_seq).padStart(3, "0")}`;

    await prisma.invoice.create({
      data: {
        invoiceNumber,
        bookingId: booking.id,
        guestId: booking.guestId,
        hotelGstin: process.env.HOTEL_GSTIN || "27XXXXX0000X1ZX",
        hotelName: process.env.HOTEL_NAME || "Rio Casa Resort",
        hotelAddress: process.env.HOTEL_ADDRESS || "Mahabaleshwar, Satara District, Maharashtra - 412806",
        guestName: booking.guestName,
        guestGstin: booking.guest.gstin,
        guestAddress,
        subtotal,
        discount: booking.discountAmount,
        taxableAmount,
        cgstRate,
        sgstRate,
        cgstAmount,
        sgstAmount,
        totalAmount: booking.totalAmount,
        lineItems: [
          {
            description: `${booking.room.name} — Room Charges`,
            nights: booking.nights,
            rate: Math.round((subtotal / booking.nights) * 100) / 100,
            amount: subtotal,
          },
        ],
        invoiceDate: day,
        status: "generated",
      },
    });
    console.log(`  CREATED ${invoiceNumber} for ${booking.bookingNumber} — ₹${booking.totalAmount}`);
    created++;
  }

  console.log(`\n${APPLY ? "Created" : "Would create"} ${created}, skipped ${skipped}.`);
  if (!APPLY) console.log("Re-run with --apply to write these.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
