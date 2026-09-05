/**
 * The money-critical outcomes were written to `audit_log` and shouted into
 * `console.error`, and read by nobody. `getOperationalAlerts` is what puts them
 * on the screen staff open every morning.
 *
 * These tests pin the two things that decide whether an alert is trustworthy:
 * what counts as still needing a human, and who is allowed to see it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFindMany } = vi.hoisted(() => ({ mockFindMany: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: { booking: { findMany: mockFindMany } },
}));

import { getOperationalAlerts } from "@/lib/alerts";

beforeEach(() => {
  mockFindMany.mockReset().mockResolvedValue([]);
});

/** The `where` of the nth findMany the call issued. */
const whereOf = (n: number) => mockFindMany.mock.calls[n][0].where;

describe("what counts as a refund still owed", () => {
  it("looks for a cancelled stay holding a payment with nothing refunded", async () => {
    await getOperationalAlerts(true);

    const where = mockFindMany.mock.calls
      .map((c) => c[0].where)
      .find((w) => w.razorpayPaymentId);

    expect(where.status).toEqual({ in: ["cancelled", "no_show"] });
    expect(where.razorpayPaymentId).toEqual({ not: null });
    // `refundAmount` being set is what marks one handled — there is no
    // "refunded" payment status to check instead.
    expect(where.OR).toEqual([{ refundAmount: null }, { refundAmount: 0 }]);
  });

  it("reports the amount and the payment id, so it can be found in Razorpay", async () => {
    mockFindMany.mockResolvedValueOnce([
      {
        id: "bk1", bookingNumber: "BK-20260901-001", guestName: "Ravi Kumar",
        guestPhone: "919999900000", totalAmount: 12980,
        razorpayPaymentId: "pay_abc", cancelledAt: new Date("2026-09-01"),
      },
    ]);

    const { refundsDue } = await getOperationalAlerts(true);

    expect(refundsDue).toHaveLength(1);
    expect(refundsDue[0].amount).toBe(12980);
    expect(refundsDue[0].razorpayPaymentId).toBe("pay_abc");
  });
});

describe("what counts as an overdue checkout", () => {
  it("is a checked-in stay whose departure day has passed", async () => {
    await getOperationalAlerts(false);

    const where = whereOf(0);
    expect(where.status).toBe("checked_in");
    // Strictly before today: a guest departing today is not overdue, they are
    // simply due — that is the night audit's `dueCheckouts`, not this.
    expect(where.checkOut.lt).toBeInstanceOf(Date);
  });
});

describe("who sees money", () => {
  it("does not even query refunds for front desk", async () => {
    await getOperationalAlerts(false);

    // Not fetched and hidden in the markup — not fetched at all.
    expect(mockFindMany).toHaveBeenCalledTimes(1);
    expect(whereOf(0).razorpayPaymentId).toBeUndefined();
  });

  it("returns an empty refund list for front desk rather than omitting it", async () => {
    const { refundsDue, overdueCheckouts } = await getOperationalAlerts(false);
    expect(refundsDue).toEqual([]);
    expect(overdueCheckouts).toEqual([]);
  });

  it("queries both for a manager", async () => {
    await getOperationalAlerts(true);
    expect(mockFindMany).toHaveBeenCalledTimes(2);
  });
});
