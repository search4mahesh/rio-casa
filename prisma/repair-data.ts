/**
 * One-off repair for data that drifted before the guards existed.
 *
 * Idempotent — safe to run repeatedly, and safe to run against production.
 * It only corrects derived state; it never touches bookings, guests' details,
 * or money.
 *
 *   npx tsx prisma/repair-data.ts            # report only
 *   npx tsx prisma/repair-data.ts --apply    # write the corrections
 *
 * Two things get repaired:
 *
 * 1. Rooms still holding a booking that has ended. `roomStatus.currentBookingId`
 *    was only ever cleared on check-out, so no-shows and cancellations left the
 *    room pointing at a dead booking — the room board kept showing that guest's
 *    name and check-out date and the room sat on `due_checkin` forever.
 *
 * 2. Guest `totalStays` / `totalRevenue`. These were maintained by a lone
 *    increment at booking creation: nothing decremented on cancellation, and
 *    bookings created any other way never touched them. Guests ended up showing
 *    "Total Stays 2" beside a history of 23 bookings.
 */
import { makeScriptClient } from "./script-client";

const prisma = makeScriptClient();
const APPLY = process.argv.includes("--apply");

/** A booking in one of these states is over — no room should still hold it. */
const ENDED = ["cancelled", "no_show", "checked_out"];

async function repairRoomStatus() {
  const holding = await prisma.roomStatus.findMany({
    where: { currentBookingId: { not: null } },
    include: {
      room: { select: { roomNumber: true } },
      currentBooking: { select: { bookingNumber: true, status: true, checkOut: true } },
    },
  });

  const stale = holding.filter(
    (rs) => !rs.currentBooking || ENDED.includes(rs.currentBooking.status)
  );

  console.log(`\nRooms holding a booking: ${holding.length}`);
  console.log(`  stale (booking already ended or missing): ${stale.length}`);
  for (const rs of stale) {
    const b = rs.currentBooking;
    console.log(
      `   #${rs.room.roomNumber} → ${b ? `${b.bookingNumber} (${b.status}, out ${b.checkOut.toISOString().slice(0, 10)})` : "missing booking"}`
    );
  }

  if (APPLY && stale.length > 0) {
    const { count } = await prisma.roomStatus.updateMany({
      where: { id: { in: stale.map((s) => s.id) } },
      data: { occupancy: "vacant", currentBookingId: null, currentGuestId: null },
    });
    console.log(`  → released ${count}`);
  }
  return stale.length;
}

async function repairGuestTotals() {
  const guests = await prisma.guest.findMany({
    select: { id: true, firstName: true, lastName: true, totalStays: true, totalRevenue: true },
  });

  let wrong = 0;
  for (const g of guests) {
    const agg = await prisma.booking.aggregate({
      where: { guestId: g.id, status: { notIn: ["cancelled", "no_show"] } },
      _count: { _all: true },
      _sum: { totalAmount: true },
    });
    const stays = agg._count._all;
    const revenue = Number(agg._sum.totalAmount ?? 0);

    if (stays === g.totalStays && revenue === Number(g.totalRevenue)) continue;
    wrong++;
    const name = `${g.firstName} ${g.lastName ?? ""}`.trim();
    console.log(
      `   ${name}: stays ${g.totalStays} → ${stays}, revenue ₹${Number(g.totalRevenue).toLocaleString("en-IN")} → ₹${revenue.toLocaleString("en-IN")}`
    );

    if (APPLY) {
      await prisma.guest.update({
        where: { id: g.id },
        data: { totalStays: stays, totalRevenue: revenue },
      });
    }
  }

  console.log(`\nGuests: ${guests.length} checked, ${wrong} with drifted totals`);
  return wrong;
}

async function main() {
  console.log(APPLY ? "REPAIR (writing changes)" : "DRY RUN — pass --apply to write changes");
  const rooms = await repairRoomStatus();
  const guests = await repairGuestTotals();

  if (!APPLY && rooms + guests > 0) {
    console.log(`\nNothing written. Re-run with --apply to fix ${rooms} room(s) and ${guests} guest(s).`);
  } else if (APPLY) {
    console.log("\nDone.");
  } else {
    console.log("\nNothing to repair.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
