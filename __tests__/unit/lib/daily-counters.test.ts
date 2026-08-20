/**
 * B-21 — laundry batch numbers used the `COUNT(*)`-then-insert pattern that
 * 2_booking_counter was written to kill for bookings.
 *
 * Two staff dispatching on the same day read the same count, computed the same
 * suffix, and the second insert died on the unique index on `batch_number` —
 * reaching housekeeping as "Server error" with the linen already handed over.
 *
 * Both document types now share one allocator over one table, because two
 * copies of an allocator is how the two booking paths drifted apart before.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQueryRaw } = vi.hoisted(() => ({ mockQueryRaw: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: mockQueryRaw } }));
vi.mock("@/lib/razorpay", () => ({ fetchOrderPaymentState: vi.fn() }));

import { nextBookingNumber, nextDailyNumber } from "@/lib/booking-service";
import { dateOnly } from "@/lib/dates";

/** Reassemble a Prisma tagged-template call. */
function lastRaw() {
  const [strings, ...values] = mockQueryRaw.mock.calls.at(-1) as [TemplateStringsArray, ...unknown[]];
  return { sql: Array.from(strings).join("?"), values };
}

beforeEach(() => {
  mockQueryRaw.mockReset().mockResolvedValue([{ last_seq: 7 }]);
});

describe("nextDailyNumber", () => {
  it("claims the next value in a single upsert, not a read then a write", async () => {
    await nextDailyNumber("laundry", "LB", dateOnly("2026-07-27"), 2);

    const { sql } = lastRaw();
    // Checking the last number and claiming the next one must be one statement,
    // or two writers on the same day compute the same suffix.
    expect(sql).toContain("INSERT INTO daily_counters");
    expect(sql).toContain("ON CONFLICT (scope, day) DO UPDATE");
    expect(sql).toContain("last_seq = daily_counters.last_seq + 1");
    expect(sql).toContain("RETURNING last_seq");
    // The pattern this replaced.
    expect(sql).not.toMatch(/COUNT\(/i);
  });

  it("formats a laundry number with a two-digit suffix", async () => {
    const n = await nextDailyNumber("laundry", "LB", dateOnly("2026-07-27"), 2);
    expect(n).toBe("LB-20260727-07");
  });

  it("formats a booking number with a three-digit suffix", async () => {
    const n = await nextBookingNumber(dateOnly("2026-09-01"));
    expect(n).toBe("BK-20260901-007");
  });

  it("keeps the two sequences apart by scope", async () => {
    await nextBookingNumber(dateOnly("2026-09-01"));
    expect(lastRaw().values).toContain("booking");

    await nextDailyNumber("laundry", "LB", dateOnly("2026-09-01"), 2);
    expect(lastRaw().values).toContain("laundry");
  });

  it("does not truncate a suffix that outgrows its padding", async () => {
    mockQueryRaw.mockResolvedValue([{ last_seq: 1234 }]);
    expect(await nextDailyNumber("laundry", "LB", dateOnly("2026-07-27"), 2)).toBe(
      "LB-20260727-1234"
    );
  });

  it("passes the day as a calendar day, not an instant", async () => {
    await nextDailyNumber("laundry", "LB", dateOnly("2026-07-27"), 2);
    // Bound as YYYY-MM-DD and cast to ::date, so a DATE primary key cannot be
    // shifted by the server's timezone.
    expect(lastRaw().values).toContain("2026-07-27");
    expect(lastRaw().sql).toContain("::date");
  });
});
