/**
 * B-05 / B-06 — the promo minimum, and the floor under the discount.
 *
 * `minAmount` was a fully built field (schema, Zod validation, admin form,
 * list display) that the claim statement never looked at, so a code restricted
 * to ₹15,000 stays applied to a ₹4,000 one. And nothing stopped a flat discount
 * exceeding the stay it was applied to, which drove `applyGst` negative and
 * sent a negative order amount to Razorpay.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  executeRaw: vi.fn().mockResolvedValue(1),
  roomFindMany: vi.fn(),
  ratePlanFindFirst: vi.fn(),
  bookingFindMany: vi.fn(),
  bookingAggregate: vi.fn(),
  guestUpdate: vi.fn(),
  auditCreate: vi.fn(),
  transaction: vi.fn(),
  txBookingCreate: vi.fn(),
  txGroupCreate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: h.queryRaw,
    $executeRaw: h.executeRaw,
    $transaction: h.transaction,
    room: { findMany: h.roomFindMany },
    ratePlan: { findFirst: h.ratePlanFindFirst },
    booking: { findMany: h.bookingFindMany, aggregate: h.bookingAggregate, updateMany: vi.fn() },
    guest: { update: h.guestUpdate },
    roomStatus: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    auditLog: { create: h.auditCreate },
  },
}));

vi.mock("@/lib/razorpay", () => ({ fetchOrderPaymentState: vi.fn() }));

import { applyGst, createBooking } from "@/lib/booking-service";

/** Reassemble a Prisma tagged-template call into inspectable SQL + values. */
function rawCall(call: unknown[]) {
  const [strings, ...values] = call as [TemplateStringsArray, ...unknown[]];
  return { sql: Array.from(strings).join("?"), values };
}

const room = {
  id: "r1", name: "Deluxe", roomType: "deluxe", pricePerNight: 4000,
  // `quoteStay` reads both; without them every rollaway prices at ₹0.
  extraBed: true, extraBedRate: 1000,
};

beforeEach(() => {
  vi.clearAllMocks();

  h.bookingFindMany.mockResolvedValue([]); // no stale holds
  h.roomFindMany.mockResolvedValue([room]);
  h.ratePlanFindFirst.mockResolvedValue(null); // price off room.pricePerNight
  h.bookingAggregate.mockResolvedValue({ _count: { _all: 1 }, _sum: { totalAmount: 0 } });
  h.guestUpdate.mockResolvedValue({});
  h.auditCreate.mockResolvedValue({});

  // claimPromo's UPDATE, then nextBookingNumber's counter upsert.
  h.queryRaw.mockImplementation((strings: TemplateStringsArray) => {
    const sql = Array.from(strings).join("");
    if (sql.includes("UPDATE promotions")) {
      return Promise.resolve([
        { id: "promo1", discount_type: "flat", discount_value: "2000", max_discount: null },
      ]);
    }
    if (sql.includes("daily_counters")) return Promise.resolve([{ last_seq: 1 }]);
    return Promise.resolve([]);
  });

  h.txBookingCreate.mockResolvedValue({
    id: "bk1", bookingNumber: "BK-20260901-001", guestId: "g1",
    totalAmount: 0, cgstAmount: 0, sgstAmount: 0, nights: 1,
    guestName: "A", guestEmail: "a@b.c",
    checkIn: new Date(), checkOut: new Date(),
    room,
  });

  h.txGroupCreate.mockResolvedValue({ id: "grp1", groupNumber: "BK-20260901-001" });

  h.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      guest: { findFirst: vi.fn().mockResolvedValue({ id: "g1" }), create: vi.fn() },
      // The room lock, then the availability re-check: both raw, both clear.
      $queryRaw: vi.fn().mockResolvedValue([{ conflict: null, blocked: false }]),
      // Every booking is a group, a single room included — there is no
      // "is this a group?" branch anywhere.
      bookingGroup: { create: h.txGroupCreate },
      booking: { create: h.txBookingCreate },
    })
  );
});

const input = {
  roomId: "r1",
  checkIn: new Date("2099-09-01T00:00:00.000Z"),
  checkOut: new Date("2099-09-02T00:00:00.000Z"),
  adults: 2,
  guestName: "Test Guest",
  guestEmail: "test@example.com",
  guestPhone: "9876543210",
};

describe("claimPromo — minAmount is enforced by the statement (B-05)", () => {
  it("puts the subtotal in the claim's WHERE clause, not in application code", async () => {
    await createBooking({ ...input, promoCode: "FLAT2000" });

    const claim = h.queryRaw.mock.calls
      .map(rawCall)
      .find((c) => c.sql.includes("UPDATE promotions"));

    expect(claim).toBeDefined();
    // The cap has to be part of the same statement that increments used_count,
    // or checking it and consuming it come apart under concurrency.
    expect(claim!.sql).toContain("min_amount");
    expect(claim!.sql).toContain("SET used_count = used_count + 1");
    // One night at ₹4,000, no rate plan.
    expect(claim!.values).toContain(4000);
  });

  it("still checks the limits it always did", async () => {
    await createBooking({ ...input, promoCode: "FLAT2000" });

    const claim = h.queryRaw.mock.calls.map(rawCall).find((c) => c.sql.includes("UPDATE promotions"))!;
    expect(claim.sql).toContain("min_nights");
    expect(claim.sql).toContain("usage_limit");
    expect(claim.sql).toContain("is_active");
  });
});

describe("discount is clamped to the stay (B-06)", () => {
  it("a flat code worth more than the booking zeroes it rather than inverting it", async () => {
    // ₹2,000 off a single ₹4,000 night is fine; make the stay cheaper than the
    // code so the clamp is what is being measured.
    h.roomFindMany.mockResolvedValue([{ ...room, pricePerNight: 1800 }]);

    await createBooking({ ...input, promoCode: "FLAT2000" });

    const written = h.txBookingCreate.mock.calls[0][0].data;
    expect(written.discountAmount).toBe(1800); // clamped from 2000
    expect(written.totalAmount).toBe(0);
    expect(written.totalAmount).toBeGreaterThanOrEqual(0);
  });

  it("leaves a discount smaller than the stay alone", async () => {
    await createBooking({ ...input, promoCode: "FLAT2000" });

    const written = h.txBookingCreate.mock.calls[0][0].data;
    expect(written.discountAmount).toBe(2000);
    expect(written.totalAmount).toBe(2240); // (4000 − 2000) × 1.12
  });
});

describe("applyGst — floor under the taxable amount (B-06)", () => {
  it("never returns a negative total", () => {
    const t = applyGst(1800, 2000, 1);
    expect(t.taxableAmount).toBe(0);
    expect(t.cgstAmount).toBe(0);
    expect(t.totalAmount).toBe(0);
  });

  it("zeroes exactly when discount equals subtotal", () => {
    expect(applyGst(5000, 5000, 1).totalAmount).toBe(0);
  });

  it("still taxes a normally discounted stay", () => {
    const t = applyGst(10000, 2000, 2);
    expect(t.taxableAmount).toBe(8000);
    expect(t.cgstAmount).toBe(480); // 6% — avg nightly 4000 ≤ 7500
    expect(t.totalAmount).toBe(8960);
  });

  it("lets a discount move the stay into the lower GST slab", () => {
    expect(applyGst(8000, 0, 1).cgstAmount).toBe(720); // 9%
    expect(applyGst(8000, 1000, 1).cgstAmount).toBe(420); // 6%
  });
});
