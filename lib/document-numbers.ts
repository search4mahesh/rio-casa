import { prisma } from "@/lib/prisma";
import { toDayString } from "@/lib/dates";

// ─────────────────────────────────────────────────────────────
// Daily document numbers — `<PREFIX>-YYYYMMDD-NNN`.
//
// Split out of lib/booking-service.ts. Bookings are only one of three callers:
// laundry dispatch and invoice generation allocate their own sequences from
// the same table, and both were importing `nextDailyNumber` from a module
// named after bookings — which is the module boundary being in the wrong
// place, not a naming quibble.
//
// One table and one function on purpose. A second allocator for laundry would
// have been less code to write and is exactly how the two booking paths
// drifted apart before.
// ─────────────────────────────────────────────────────────────

/**
 * Allocate the next `BK-YYYYMMDD-NNN` for a check-in day.
 *
 * One statement, atomic, and deliberately outside the booking transaction. It
 * replaces a `COUNT(*)` that was both wrong and expensive: the prefix came from
 * the check-in day while the count window came from `created_at`, so every
 * advance booking for a date computed `-001`, and the second one died on the
 * unique index — reported to the guest as "this room was just booked". A COUNT
 * over a predicate also takes a predicate lock under SERIALIZABLE, which let
 * bookings for unrelated rooms abort one another.
 *
 * A booking that then fails burns its number. Gaps are fine; duplicates are not.
 */
export async function nextBookingNumber(day: Date): Promise<string> {
  return nextDailyNumber("booking", "BK", day, 3);
}

/**
 * Allocate the next `<PREFIX>-YYYYMMDD-NNN` for a day, atomically.
 *
 * One statement against `daily_counters`, which is the whole point: checking
 * what the last number was and claiming the next one cannot be separated, so
 * two writers on the same day cannot compute the same suffix. The alternative
 * — `COUNT(*)` over rows whose number starts with the prefix — loses that race
 * and the loser dies on a unique index, which is what both the booking route
 * and the laundry dispatch route used to do.
 *
 * `scope` keeps each document type's sequence independent, so a laundry batch
 * never consumes a booking number.
 *
 * @param pad digits in the suffix — bookings use 3 (`-001`), laundry 2 (`-01`),
 *            matching the numbers each already had in circulation.
 */
export async function nextDailyNumber(
  scope: string,
  prefix: string,
  day: Date,
  pad = 3
): Promise<string> {
  const dayStr = toDayString(day);
  const [row] = await prisma.$queryRaw<Array<{ last_seq: number }>>`
    INSERT INTO daily_counters (scope, day, last_seq)
    VALUES (${scope}, ${dayStr}::date, 1)
    ON CONFLICT (scope, day) DO UPDATE SET last_seq = daily_counters.last_seq + 1
    RETURNING last_seq
  `;
  return `${prefix}-${dayStr.replace(/-/g, "")}-${String(row.last_seq).padStart(pad, "0")}`;
}
