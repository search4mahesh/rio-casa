/**
 * Calendar-day helpers for the `@db.Date` columns.
 *
 * `checkIn`, `checkOut`, `blockDate`, `validFrom/To`, `invoiceDate`, `Expense.date`
 * and friends are Postgres `DATE` columns — they store a calendar day, not an
 * instant. Prisma hands them to us as UTC-midnight `Date` objects and compares
 * them by casting whatever bound we pass down to a date.
 *
 * That makes the obvious constructions wrong:
 *
 *   new Date(y, m, d)            // local midnight
 *   new Date("2026-12-20T00:00:00")   // also local midnight
 *
 * In IST (UTC+5:30) both are `…T18:30:00Z` on the *previous* day, and Postgres
 * truncates them straight back to that previous day. Blocking 20–21 Dec stored
 * 19–20 Dec; the dashboard's "today" window silently selected yesterday.
 *
 * So: a calendar day is always UTC midnight, and "which day is it?" is answered
 * in the property's timezone rather than the server's. The latter matters
 * because the dev box runs IST while Vercel runs UTC — without an explicit zone
 * the same code picks a different day in each place after 18:30 UTC.
 */

/** Where the property actually is. "Today" means today *here*, not on the server. */
export const PROPERTY_TIME_ZONE = "Asia/Kolkata";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The calendar day an instant falls on at the property, as "YYYY-MM-DD".
 * Uses the property timezone explicitly so the answer does not depend on where
 * this runs.
 */
export function propertyDayString(instant: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD, which is exactly the shape we want.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PROPERTY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/**
 * Turn a "YYYY-MM-DD" string into the value a `DATE` column holds for that day.
 * Throws on malformed input rather than silently yielding `Invalid Date`, which
 * would otherwise reach Prisma and fail far from the cause.
 */
export function dateOnly(day: string): Date {
  if (!YMD.test(day)) throw new RangeError(`Expected YYYY-MM-DD, got "${day}"`);
  const d = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new RangeError(`Invalid date: "${day}"`);
  return d;
}

/** Today at the property, as a `DATE`-column value. */
export function today(now: Date = new Date()): Date {
  return dateOnly(propertyDayString(now));
}

/** Render a `DATE`-column value back to "YYYY-MM-DD". */
export function toDayString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Shift a calendar day by whole days. Safe across DST because it stays in UTC. */
export function addDays(day: Date, n: number): Date {
  return new Date(day.getTime() + n * 86_400_000);
}

/**
 * Half-open `[start, end)` window covering exactly `days` calendar days from
 * `from`. Use with `{ gte: start, lt: end }` — an inclusive `lte` on the last
 * day would also match that whole day and pull in one extra.
 */
export function dayRange(from: Date, days = 1): { start: Date; end: Date } {
  return { start: from, end: addDays(from, days) };
}

/** Whole days between two calendar days. */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** First day of the month a calendar day falls in, as a `DATE`-column value. */
export function startOfMonth(day: Date): Date {
  return dateOnly(`${toDayString(day).slice(0, 7)}-01`);
}

/**
 * Shift a calendar day by whole months, keeping the day-of-month where the
 * target month has one and clamping to its last day where it does not.
 *
 * `setUTCMonth` alone overflows into the following month: from 31 January it
 * produces "31 February", which is 3 March. This was documented as "first day
 * of the month n months after day" — true of every caller that passes a month
 * start, but `reports` uses it as a plain month shift (`addMonths(to, -12)`)
 * on whatever day the report ends, so the name has to mean what it says.
 *
 *   addMonths(dateOnly("2026-01-31"),  1)  →  2026-02-28
 *   addMonths(dateOnly("2026-03-31"), -1)  →  2026-02-28
 *   addMonths(dateOnly("2026-09-01"),  1)  →  2026-10-01
 *
 * Use `startOfMonth` when you want a month boundary — that is what it is for.
 */
export function addMonths(day: Date, n: number): Date {
  const year = day.getUTCFullYear();
  const month = day.getUTCMonth();
  const dayOfMonth = day.getUTCDate();

  // Day 0 of the *next* month is the last day of the one we are aiming at.
  const lastDayOfTarget = new Date(Date.UTC(year, month + n + 1, 0)).getUTCDate();

  return new Date(Date.UTC(year, month + n, Math.min(dayOfMonth, lastDayOfTarget)));
}
