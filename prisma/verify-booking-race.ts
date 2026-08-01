import "dotenv/config";
import { createBooking } from "../lib/booking-service";
import { makeScriptClient } from "./script-client";

/**
 * Concurrency check for the double-booking guard.
 *
 *   npx tsx prisma/verify-booking-race.ts [concurrency]
 *
 * Fires N simultaneous bookings at the same room and dates and asserts that
 * exactly one wins. Cleans up after itself.
 *
 * Worth running after anything that touches the booking transaction, the
 * isolation level, the connection pool, or the Prisma version. The upgrade to
 * Prisma 7 is the reason this exists: correctness held, but the losing requests
 * degraded from a clean "room not available" into pool-exhaustion and
 * serialization errors surfaced to guests as "Something went wrong". Unit tests
 * mock the database and cannot see any of that.
 *
 * Note it writes to whatever DATABASE_URL points at. Rows are removed at the
 * end, but don't aim it at production during business hours.
 */

const db = makeScriptClient();
const TAG = "racetest@example.com";
const CONCURRENCY = Number(process.argv[2] ?? 8);

// Far enough out that it cannot collide with real inventory.
const CHECK_IN = new Date("2028-09-10T00:00:00.000Z");
const CHECK_OUT = new Date("2028-09-13T00:00:00.000Z");

async function main() {
  const room = await db.room.findFirstOrThrow({ select: { id: true, roomNumber: true } });
  console.log(`racing ${CONCURRENCY} concurrent bookings — room #${room.roomNumber}, 10–13 Sep 2028\n`);

  const results = await Promise.allSettled(
    Array.from({ length: CONCURRENCY }, (_, i) =>
      createBooking({
        roomId: room.id,
        checkIn: CHECK_IN,
        checkOut: CHECK_OUT,
        adults: 2,
        guestName: `Race ${i}`,
        guestEmail: TAG,
        guestPhone: `90000000${i}`,
        source: "website",
      })
    )
  );

  let won = 0;
  let rejected = 0;
  let unknown = 0;
  for (const r of results) {
    if (r.status === "rejected") { unknown++; console.log("  threw:", String(r.reason).slice(0, 120)); continue; }
    if (r.value.success) won++;
    else if (r.value.errorCode === "ROOM_NOT_AVAILABLE") rejected++;
    else { unknown++; console.log(`  ${r.value.errorCode}: ${r.value.error?.slice(0, 100)}`); }
  }

  const persisted = await db.booking.count({
    where: { roomId: room.id, guestEmail: TAG, status: { notIn: ["cancelled", "no_show"] } },
  });

  console.log(`\nwon: ${won}   cleanly rejected: ${rejected}   unknown failures: ${unknown}`);
  console.log(`bookings persisted for that room + range: ${persisted}`);

  const del = await db.booking.deleteMany({ where: { guestEmail: TAG } });
  await db.guest.deleteMany({ where: { email: TAG } });
  console.log(`cleanup: removed ${del.count} booking(s)`);

  // Exactly one winner, nothing double-booked, and every loser got a real answer.
  const pass = won === 1 && persisted === 1 && unknown === 0;
  console.log(pass ? "\nPASS — one winner, no double booking, no unknown failures" : "\nFAIL");
  if (!pass) process.exitCode = 1;
}

main()
  .catch((e) => { console.error("FATAL", e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
