/**
 * B-41. `Math.max(1, parseInt("abc"))` is NaN, not 1 — NaN loses every
 * comparison, so it propagated to `skip: NaN` and Prisma killed the request
 * with an empty 500. The admin panels cannot parse a zero-byte body, so the
 * visible symptom was a page stuck on "Loading…".
 */
import { describe, it, expect } from "vitest";
import { positiveIntParam } from "@/lib/query-params";
import { isMonthString } from "@/lib/dates";

describe("positiveIntParam", () => {
  it("parses a normal value", () => {
    expect(positiveIntParam("3")).toBe(3);
  });

  it("never returns NaN for junk — this is the bug", () => {
    for (const junk of ["abc", "", "  ", "NaN", "1e", null]) {
      const n = positiveIntParam(junk);
      expect(Number.isNaN(n)).toBe(false);
      expect(n).toBe(1);
    }
  });

  it("floors at 1, so a negative or zero page cannot produce a negative skip", () => {
    expect(positiveIntParam("0")).toBe(1);
    expect(positiveIntParam("-5")).toBe(1);
  });

  it("honours an explicit fallback and cap", () => {
    expect(positiveIntParam(null, 2)).toBe(2);
    expect(positiveIntParam("999", 1, 20)).toBe(20);
  });

  it("takes the leading integer of a decimal rather than a fractional skip", () => {
    expect(positiveIntParam("2.9")).toBe(2);
  });
});

describe("isMonthString", () => {
  it("accepts real months", () => {
    expect(isMonthString("2026-01")).toBe(true);
    expect(isMonthString("2026-12")).toBe(true);
  });

  it("rejects the out-of-range months a bare \\d{2} let through", () => {
    // "2026-99" passed the old regex, then threw inside `dateOnly` and the
    // route answered with an empty 500.
    for (const bad of ["2026-99", "2026-00", "2026-13", "2026-1", "abcd-ef", "2026", ""]) {
      expect(isMonthString(bad)).toBe(false);
    }
  });
});

/**
 * B-56 — the connection pool size went through bare `Number()`.
 *
 * `Number("abc")` is NaN, and pg-pool assigns `max = max || … || 10`, so NaN is
 * falsy and lands on 10 — exactly the starving default `lib/prisma.ts` sets
 * `max` to move away from. A typo in one env var silently undid the fix for
 * booking-contention `P2028`, with no error anywhere.
 */
describe("pool size parsing (B-56)", () => {
  const poolMax = (raw: string | null) => positiveIntParam(raw, 20, 100);

  it("never yields a value pg-pool would treat as falsy", () => {
    for (const raw of ["abc", "", "  ", null, "NaN", "twenty"]) {
      const n = poolMax(raw);
      // The precise failure: NaN is falsy, so pg-pool silently used 10.
      expect(Number.isNaN(n)).toBe(false);
      expect(Boolean(n)).toBe(true);
      expect(n).toBe(20);
    }
  });

  it("honours a real value", () => {
    expect(poolMax("40")).toBe(40);
  });

  it("caps the other direction of the same typo", () => {
    expect(poolMax("200000")).toBe(100);
  });

  it("never drops below one connection", () => {
    expect(poolMax("0")).toBe(1);
    expect(poolMax("-5")).toBe(1);
  });
});
