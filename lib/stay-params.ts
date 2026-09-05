import { dateOnly, daysBetween, isDayString, today } from "@/lib/dates";

/**
 * A stay read out of a query string.
 *
 * `none` and `error` are kept apart on purpose. No dates at all is not a
 * failure — the catalogue simply makes no availability claim — while a broken
 * range is something the guest has to be told about, and neither may be shown
 * as "nothing is free".
 */
export type Stay =
  | { kind: "none" }
  | { kind: "error"; message: "invalidRange" | "pastCheckIn" }
  | { kind: "stay"; checkIn: Date; checkOut: Date; nights: number };

/**
 * Read `?checkIn=&checkOut=` the way every page that takes them must.
 *
 * Shared rather than repeated because `/rooms` and `/rooms/[slug]` are one
 * link apart and carry the same pair between them: two readers that disagreed
 * about which ranges are askable would let a guest click through from a
 * catalogue card showing counts to a detail page showing none, or the reverse.
 *
 * Query params get the same care as bodies (see CLAUDE.md). `isDayString`
 * rather than a bare `/^\d{4}-\d{2}-\d{2}$/`, because that regex accepts
 * `2026-02-30` and `dateOnly` then throws — which on a page is an empty 500
 * rather than the "pick different dates" this is trying to say.
 */
export function readStay(raw: { checkIn?: string; checkOut?: string }): Stay {
  const { checkIn, checkOut } = raw;
  if (!checkIn && !checkOut) return { kind: "none" };
  if (!checkIn || !checkOut || !isDayString(checkIn) || !isDayString(checkOut)) {
    return { kind: "error", message: "invalidRange" };
  }

  const from = dateOnly(checkIn);
  const to = dateOnly(checkOut);
  if (to <= from) return { kind: "error", message: "invalidRange" };
  // A stay in the past is not "unavailable", it is unaskable — and
  // `getAvailableRooms` answers an empty list for it, which would read on
  // these pages as the whole property being booked out.
  if (from < today()) return { kind: "error", message: "pastCheckIn" };

  return { kind: "stay", checkIn: from, checkOut: to, nights: daysBetween(from, to) };
}

/** "2 Sep 2026" — the format the public site reads dates in. */
export function humanDay(day: string): string {
  return new Date(`${day}T00:00:00.000Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
