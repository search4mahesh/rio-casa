/**
 * Calendar-day helpers for the `@db.Date` columns.
 *
 * The rule these all serve: a calendar day is UTC midnight, and "which day is
 * it?" is answered in the property's timezone rather than the server's. Getting
 * that wrong shipped three separate bugs — see the header of lib/dates.ts.
 */
import { describe, it, expect } from "vitest";
import {
  addMonths,
  startOfMonth,
  addDays,
  dateOnly,
  toDayString,
  daysBetween,
  today,
  propertyDayString,
  dayRange,
  isDayString,
  propertyDayStartInstant,
  dayAfter,
} from "@/lib/dates";

describe("addMonths", () => {
  it("keeps the day of month when the target month has one", () => {
    expect(toDayString(addMonths(dateOnly("2026-09-15"), 1))).toBe("2026-10-15");
    expect(toDayString(addMonths(dateOnly("2026-09-15"), -1))).toBe("2026-08-15");
  });

  it("clamps instead of overflowing into the next month (B-15)", () => {
    // `setUTCMonth` alone turned 31 January into "31 February" — 3 March.
    expect(toDayString(addMonths(dateOnly("2026-01-31"), 1))).toBe("2026-02-28");
    expect(toDayString(addMonths(dateOnly("2026-03-31"), -1))).toBe("2026-02-28");
    expect(toDayString(addMonths(dateOnly("2026-05-31"), 1))).toBe("2026-06-30");
  });

  it("clamps to 29 February in a leap year", () => {
    expect(toDayString(addMonths(dateOnly("2028-01-31"), 1))).toBe("2028-02-29");
  });

  it("crosses year boundaries in both directions", () => {
    expect(toDayString(addMonths(dateOnly("2026-12-01"), 1))).toBe("2027-01-01");
    expect(toDayString(addMonths(dateOnly("2026-01-01"), -1))).toBe("2025-12-01");
    expect(toDayString(addMonths(dateOnly("2026-08-14"), -12))).toBe("2025-08-14");
  });

  it("is exact on month starts, which is what every bucket caller passes", () => {
    for (let m = 1; m <= 12; m++) {
      const start = dateOnly(`2026-${String(m).padStart(2, "0")}-01`);
      expect(toDayString(addMonths(start, 1)).slice(-2)).toBe("01");
    }
  });

  it("always returns UTC midnight", () => {
    const d = addMonths(dateOnly("2026-01-31"), 1);
    expect(d.toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });

  it("round-trips: forward then back lands on the same month", () => {
    const start = dateOnly("2026-03-31");
    // Not the same *day* — clamping is lossy, by design. The month must match.
    expect(toDayString(addMonths(addMonths(start, -1), 1)).slice(0, 7)).toBe("2026-03");
  });

  it("gives the length of any month when paired with daysBetween", () => {
    const feb = dateOnly("2026-02-01");
    expect(daysBetween(feb, addMonths(feb, 1))).toBe(28);
    const leapFeb = dateOnly("2028-02-01");
    expect(daysBetween(leapFeb, addMonths(leapFeb, 1))).toBe(29);
    const dec = dateOnly("2026-12-01");
    expect(daysBetween(dec, addMonths(dec, 1))).toBe(31);
  });
});

describe("dateOnly", () => {
  it("parses a calendar day to UTC midnight", () => {
    expect(dateOnly("2026-12-20").toISOString()).toBe("2026-12-20T00:00:00.000Z");
  });

  it("throws on malformed input rather than yielding Invalid Date", () => {
    // An Invalid Date reaching Prisma fails far from the cause.
    expect(() => dateOnly("20-12-2026")).toThrow(RangeError);
    expect(() => dateOnly("2026-12")).toThrow(RangeError);
    expect(() => dateOnly("")).toThrow(RangeError);
  });
});

describe("startOfMonth / addDays / dayRange", () => {
  it("startOfMonth returns the first day at UTC midnight", () => {
    expect(startOfMonth(dateOnly("2026-08-31")).toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });

  it("addDays crosses month and year ends", () => {
    expect(toDayString(addDays(dateOnly("2026-12-31"), 1))).toBe("2027-01-01");
    expect(toDayString(addDays(dateOnly("2026-03-01"), -1))).toBe("2026-02-28");
  });

  it("dayRange is half-open", () => {
    const { start, end } = dayRange(dateOnly("2026-08-01"), 31);
    expect(toDayString(start)).toBe("2026-08-01");
    // Exclusive: an inclusive bound would pull in the whole of 31 August too.
    expect(toDayString(end)).toBe("2026-09-01");
  });
});

describe("propertyDayString / today", () => {
  it("answers in the property's timezone, not the server's", () => {
    // 18:00 UTC on 14 Aug is already 23:30 on the 14th in IST; 19:00 UTC is
    // 00:30 on the *15th*. A server-local answer would say the 14th for both.
    expect(propertyDayString(new Date("2026-08-14T18:00:00.000Z"))).toBe("2026-08-14");
    expect(propertyDayString(new Date("2026-08-14T19:00:00.000Z"))).toBe("2026-08-15");
  });

  it("today() is that day as a DATE-column value", () => {
    const t = today(new Date("2026-08-14T19:00:00.000Z"));
    expect(t.toISOString()).toBe("2026-08-15T00:00:00.000Z");
  });
});

/**
 * B-45. A day that does not exist does not come back as `Invalid Date` — it
 * rolls over. `new Date("2026-02-30T00:00:00.000Z")` is 2 March, so a request
 * to block "30 Feb" silently blocked a day in March and nothing told the
 * caller. Round-tripping is the only way to catch it.
 */
describe("dateOnly — impossible days (B-45)", () => {
  it("rejects a day that does not exist instead of rolling it forward", () => {
    expect(() => dateOnly("2026-02-30")).toThrow(/no such date/i);
    expect(() => dateOnly("2026-11-31")).toThrow(/no such date/i);
    expect(() => dateOnly("2025-02-29")).toThrow(/no such date/i); // 2025 is not a leap year
  });

  it("still accepts the real edges, including a leap day", () => {
    expect(toDayString(dateOnly("2026-02-28"))).toBe("2026-02-28");
    expect(toDayString(dateOnly("2024-02-29"))).toBe("2024-02-29"); // 2024 is
    expect(toDayString(dateOnly("2026-12-31"))).toBe("2026-12-31");
  });

  it("still rejects the shapes it always did", () => {
    expect(() => dateOnly("2026-13-01")).toThrow();
    expect(() => dateOnly("not-a-date")).toThrow();
    expect(() => dateOnly("2026-1-1")).toThrow();
  });
});

describe("isDayString — the predicate behind dateOnly, without the throw", () => {
  it("agrees with dateOnly on every input", () => {
    for (const s of [
      "2026-02-30", "2026-11-31", "2025-02-29", "2026-13-01", "2026-1-1",
      "not-a-date", "", "2026-02-28", "2024-02-29", "2026-12-31",
    ]) {
      let parses = true;
      try { dateOnly(s); } catch { parses = false; }
      expect(isDayString(s)).toBe(parses);
    }
  });
});

/**
 * The one helper here that is *not* about `@db.Date` columns.
 *
 * Timestamp columns — `audit_log.created_at`, `Booking.createdAt` — hold an
 * instant, so "everything on 1 August" is IST midnight to IST midnight. Using
 * `dateOnly` on one of those loses every row written before 05:30 IST and
 * picks up the previous evening in their place.
 */
describe("propertyDayStartInstant — day bounds for timestamp columns", () => {
  it("is IST midnight, which is 18:30Z the previous day", () => {
    expect(propertyDayStartInstant("2026-08-01").toISOString()).toBe("2026-07-31T18:30:00.000Z");
  });

  it("is deliberately not UTC midnight — the distinction dateOnly cannot make", () => {
    expect(propertyDayStartInstant("2026-08-01").getTime())
      .not.toBe(dateOnly("2026-08-01").getTime());
    // Exactly 5h30m earlier, the IST offset.
    expect(dateOnly("2026-08-01").getTime() - propertyDayStartInstant("2026-08-01").getTime())
      .toBe(5.5 * 3600_000);
  });

  it("holds across a year boundary", () => {
    expect(propertyDayStartInstant("2027-01-01").toISOString()).toBe("2026-12-31T18:30:00.000Z");
  });

  // India has no DST, so the offset must not move with the season. A helper
  // that drifted here would shift audit windows by an hour half the year.
  it("uses the same offset in January and July", () => {
    const jan = dateOnly("2026-01-15").getTime() - propertyDayStartInstant("2026-01-15").getTime();
    const jul = dateOnly("2026-07-15").getTime() - propertyDayStartInstant("2026-07-15").getTime();
    expect(jan).toBe(jul);
  });

  it("rejects a day that does not exist, like dateOnly", () => {
    expect(() => propertyDayStartInstant("2026-02-30")).toThrow();
  });
});

describe("dayAfter", () => {
  it("advances one day", () => {
    expect(dayAfter("2026-08-01")).toBe("2026-08-02");
  });

  it("crosses month and year ends", () => {
    expect(dayAfter("2026-08-31")).toBe("2026-09-01");
    expect(dayAfter("2026-12-31")).toBe("2027-01-01");
  });

  it("handles a leap day", () => {
    expect(dayAfter("2024-02-28")).toBe("2024-02-29");
    expect(dayAfter("2024-02-29")).toBe("2024-03-01");
  });
});
