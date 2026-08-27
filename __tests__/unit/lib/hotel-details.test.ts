import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isGstin,
  gstinProblem,
  hotelBillingDetails,
  hotelDetailsForDisplay,
  PLACEHOLDER_GSTIN,
  GSTIN_PATTERN,
} from "@/lib/hotel-details";

/**
 * B-62 — `HOTEL_GSTIN` fell back to `27XXXXX0000X1ZX`, which was snapshotted
 * onto every Invoice row at check-out and printed on the tax invoice handed to
 * the guest. All 35 invoices on file carried it.
 *
 * The placeholder has to be rejected **by value**: it is a well-formed GSTIN
 * as far as the pattern goes, and `.env` had it set explicitly rather than
 * left blank — so a check for "unset" alone would have passed it through.
 */

const REAL = "27AABCU9603R1ZM";
const ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ENV };
});

afterEach(() => {
  process.env = ENV;
  vi.restoreAllMocks();
});

describe("GSTIN validation", () => {
  it("accepts a well-formed GSTIN", () => {
    expect(isGstin(REAL)).toBe(true);
    expect(GSTIN_PATTERN.test(REAL)).toBe(true);
  });

  // The trap: it passes the shape check, so shape alone was never enough.
  it("rejects the placeholder even though it matches the pattern", () => {
    expect(GSTIN_PATTERN.test(PLACEHOLDER_GSTIN)).toBe(true);
    expect(isGstin(PLACEHOLDER_GSTIN)).toBe(false);
  });

  it("rejects the placeholder whatever its case", () => {
    expect(isGstin(PLACEHOLDER_GSTIN.toLowerCase())).toBe(false);
  });

  it.each([
    ["", "empty"],
    ["27AABCU9603R1Z", "too short"],
    ["27AABCU9603R1ZMM", "too long"],
    ["ZZAABCU9603R1ZM", "state code not numeric"],
    ["27AABCU9603R1XM", "missing the literal Z"],
    ["27 AABCU9603R1ZM", "contains a space"],
  ])("rejects %s (%s)", (value) => {
    expect(isGstin(value)).toBe(false);
  });

  it("rejects null and undefined", () => {
    expect(isGstin(null)).toBe(false);
    expect(isGstin(undefined)).toBe(false);
  });
});

describe("gstinProblem", () => {
  it("says nothing is wrong with a real one", () => {
    expect(gstinProblem(REAL)).toBeNull();
  });

  it("names the specific problem so the panel can render it", () => {
    expect(gstinProblem(undefined)).toMatch(/not set/i);
    expect(gstinProblem("   ")).toMatch(/not set/i);
    expect(gstinProblem(PLACEHOLDER_GSTIN)).toMatch(/placeholder/i);
    expect(gstinProblem("nonsense")).toMatch(/not a valid/i);
  });
});

describe("hotelBillingDetails — fails shut in production", () => {
  it.each([
    ["unset", undefined],
    ["the placeholder", PLACEHOLDER_GSTIN],
    ["malformed", "27NOPE"],
  ])("throws in production when HOTEL_GSTIN is %s", (_label, value) => {
    process.env.NODE_ENV = "production";
    if (value === undefined) delete process.env.HOTEL_GSTIN;
    else process.env.HOTEL_GSTIN = value;

    // Same posture as JWT_SECRET and CRON_SECRET: a missing secret must fail
    // shut, not open.
    expect(() => hotelBillingDetails()).toThrow(/refusing to write a tax invoice/i);
  });

  it("returns the configured GSTIN in production when it is real", () => {
    process.env.NODE_ENV = "production";
    process.env.HOTEL_GSTIN = REAL;

    expect(hotelBillingDetails().gstin).toBe(REAL);
  });

  it("normalises case and whitespace", () => {
    process.env.NODE_ENV = "production";
    process.env.HOTEL_GSTIN = `  ${REAL.toLowerCase()}  `;

    expect(hotelBillingDetails().gstin).toBe(REAL);
  });

  // The development fallback exists so seed data can be invoiced locally, and
  // is unreachable in production for the same reason the JWT one is.
  it("falls back outside production, with a warning", () => {
    process.env.NODE_ENV = "development";
    process.env.HOTEL_GSTIN = PLACEHOLDER_GSTIN;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(hotelBillingDetails().gstin).toBe(PLACEHOLDER_GSTIN);
    expect(warn).toHaveBeenCalled();
  });

  it("carries name and address through, with sensible defaults", () => {
    process.env.NODE_ENV = "production";
    process.env.HOTEL_GSTIN = REAL;
    process.env.HOTEL_NAME = "Rio Casa Resort Pvt Ltd";
    delete process.env.HOTEL_ADDRESS;

    const details = hotelBillingDetails();
    expect(details.name).toBe("Rio Casa Resort Pvt Ltd");
    expect(details.address).toContain("Mahabaleshwar");
  });
});

describe("hotelDetailsForDisplay — never throws", () => {
  it("reports the problem instead of a plausible fake", () => {
    process.env.NODE_ENV = "production";
    process.env.HOTEL_GSTIN = PLACEHOLDER_GSTIN;

    const shown = hotelDetailsForDisplay();

    // The settings page is the one screen whose job is to show this. Rendering
    // the placeholder there is how 35 invoices went out before anyone noticed.
    expect(shown.gstin).toBe("");
    expect(shown.problem).toMatch(/placeholder/i);
  });

  it("shows the GSTIN and no problem when it is configured", () => {
    process.env.HOTEL_GSTIN = REAL;

    const shown = hotelDetailsForDisplay();
    expect(shown.gstin).toBe(REAL);
    expect(shown.problem).toBeNull();
  });

  it("does not throw in production with nothing configured", () => {
    process.env.NODE_ENV = "production";
    delete process.env.HOTEL_GSTIN;

    expect(() => hotelDetailsForDisplay()).not.toThrow();
    expect(hotelDetailsForDisplay().problem).toMatch(/not set/i);
  });
});
