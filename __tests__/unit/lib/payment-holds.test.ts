/**
 * `createBooking` commits the booking before the Razorpay order exists, so an
 * unpaid `confirmed` / `pending` row holds the room while the guest pays. That
 * hold was never released: availability skips only cancelled / no_show / failed,
 * and nothing swept. A guest who closed the checkout window took the room off
 * the calendar until the stay was over.
 *
 * The dangerous half of the fix is the cancelling. These tests pin down what
 * must *not* be cancelled.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFindMany, mockUpdateMany, mockAuditCreate, mockRoomStatusUpdateMany, mockAggregate, mockGuestUpdate, mockFetchOrderState } =
  vi.hoisted(() => ({
    mockFindMany: vi.fn(),
    mockUpdateMany: vi.fn(),
    mockAuditCreate: vi.fn().mockResolvedValue({}),
    mockRoomStatusUpdateMany: vi.fn().mockResolvedValue({ count: 0 }),
    mockAggregate: vi.fn().mockResolvedValue({ _count: { _all: 0 }, _sum: { totalAmount: 0 } }),
    mockGuestUpdate: vi.fn().mockResolvedValue({}),
    mockFetchOrderState: vi.fn(),
  }));

vi.mock("@/lib/prisma", () => {
  const client = {
    booking: { findMany: mockFindMany, updateMany: mockUpdateMany, aggregate: mockAggregate },
    roomStatus: { updateMany: mockRoomStatusUpdateMany },
    guest: { update: mockGuestUpdate },
    auditLog: { create: mockAuditCreate },
    // The cancelling write runs in a transaction so a party's rooms are voided
    // all together or not at all — a short count throws and rolls the unit
    // back. The callback form is the only one the sweeper uses.
    $transaction: (fn: (tx: unknown) => unknown) => Promise.resolve(fn(client)),
  };
  return { prisma: client };
});

vi.mock("@/lib/razorpay", () => ({
  fetchOrderPaymentState: mockFetchOrderState,
}));

import { expireStalePaymentHolds, BOOKING_HOLD_MINUTES } from "@/lib/booking-service";

const stale = {
  id: "bk1",
  bookingNumber: "BK-20260815-001",
  guestId: "g1",
  razorpayOrderId: "order_1",
  // A lone website booking, not one room of a party.
  groupId: null,
};

beforeEach(() => {
  mockFindMany.mockReset().mockResolvedValue([]);
  mockUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  mockRoomStatusUpdateMany.mockClear();
  mockAuditCreate.mockClear();
  mockGuestUpdate.mockClear();
  mockFetchOrderState.mockReset().mockResolvedValue("unpaid");
});

describe("expireStalePaymentHolds — what it cancels", () => {
  it("voids an abandoned checkout and frees the room", async () => {
    mockFindMany.mockResolvedValueOnce([stale]);

    const result = await expireStalePaymentHolds();

    expect(result).toEqual({ expired: 1, retained: 0 });
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "cancelled", paymentStatus: "failed" }),
      })
    );
    // Availability skips cancelled/failed, so this is what frees the room.
    expect(mockRoomStatusUpdateMany).toHaveBeenCalled();
  });

  it("only considers website bookings that are confirmed, pending and unpaid", async () => {
    await expireStalePaymentHolds();

    const where = mockFindMany.mock.calls[0][0].where;
    // A walk-in sits at `pending` when the desk takes payment on departure, and
    // an OTA import is `pending` because the guest paid the channel. Cancelling
    // either would delete a real stay.
    expect(where.source).toBe("website");
    expect(where.status).toBe("confirmed");
    expect(where.paymentStatus).toBe("pending");
    expect(where.razorpayPaymentId).toBeNull();
    expect(where.createdAt.lt).toBeInstanceOf(Date);
  });

  it("leaves bookings inside the hold window alone", async () => {
    await expireStalePaymentHolds({ now: new Date("2026-08-15T12:00:00.000Z") });

    const cutoff: Date = mockFindMany.mock.calls[0][0].where.createdAt.lt;
    expect(cutoff.toISOString()).toBe(
      new Date(Date.parse("2026-08-15T12:00:00.000Z") - BOOKING_HOLD_MINUTES * 60_000).toISOString()
    );
  });

  it("scopes to one room when asked", async () => {
    await expireStalePaymentHolds({ roomId: "room_7" });
    expect(mockFindMany.mock.calls[0][0].where.roomId).toEqual({ in: ["room_7"] });
  });

  it("scopes to every room a party is booking", async () => {
    // `createGroupBooking` sweeps all the rooms it is about to take, so a guest
    // is never blocked by a dead hold on the second room of their party.
    await expireStalePaymentHolds({ roomIds: ["room_7", "room_8"] });
    expect(mockFindMany.mock.calls[0][0].where.roomId).toEqual({ in: ["room_7", "room_8"] });
  });

  it("scans every room when given no scope", async () => {
    await expireStalePaymentHolds();
    expect(mockFindMany.mock.calls[0][0].where.roomId).toBeUndefined();
  });
});

describe("expireStalePaymentHolds — what it must never cancel", () => {
  it("keeps a hold Razorpay reports as paid", async () => {
    // The booking that hit "you have paid but we could not confirm it" is
    // indistinguishable in our own database from an abandoned one: both are
    // pending with no razorpayPaymentId, because the failure was in the verify
    // step that would have written one.
    mockFindMany.mockResolvedValueOnce([stale]);
    mockFetchOrderState.mockResolvedValueOnce("paid");

    const result = await expireStalePaymentHolds();

    expect(result).toEqual({ expired: 0, retained: 1 });
    expect(mockUpdateMany).not.toHaveBeenCalled();
    // Nothing was voided, so no room is released.
    expect(mockRoomStatusUpdateMany).not.toHaveBeenCalled();
  });

  it("keeps a hold when Razorpay cannot be reached", async () => {
    // Failing safe: an API outage must not cancel a stay someone paid for.
    mockFindMany.mockResolvedValueOnce([stale]);
    mockFetchOrderState.mockResolvedValueOnce("unknown");

    const result = await expireStalePaymentHolds();

    expect(result).toEqual({ expired: 0, retained: 1 });
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it("does not cancel a booking that was paid between the read and the write", async () => {
    mockFindMany.mockResolvedValueOnce([stale]);
    // The compare-and-swap matches nothing because /api/payment/verify already
    // moved the row off `pending`.
    mockUpdateMany.mockResolvedValueOnce({ count: 0 });

    const result = await expireStalePaymentHolds();

    expect(result).toEqual({ expired: 0, retained: 1 });
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });

  it("re-checks status and paymentStatus in the cancelling UPDATE itself", async () => {
    mockFindMany.mockResolvedValueOnce([stale]);
    await expireStalePaymentHolds();

    // `id: { in: [...] }` because a party's rooms are voided in one statement,
    // all or nothing. The compare-and-swap on status/paymentStatus is the part
    // that matters: a payment landing mid-sweep must not be undone.
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["bk1"] }, status: "confirmed", paymentStatus: "pending" },
      })
    );
  });
});

describe("expireStalePaymentHolds — bookkeeping", () => {
  it("cancels a hold that never got an order without calling Razorpay", async () => {
    mockFindMany.mockResolvedValueOnce([{ ...stale, razorpayOrderId: null }]);

    const result = await expireStalePaymentHolds();

    expect(mockFetchOrderState).not.toHaveBeenCalled();
    expect(result.expired).toBe(1);
  });

  it("writes an audit row for every hold it voids", async () => {
    mockFindMany.mockResolvedValueOnce([stale]);
    await expireStalePaymentHolds();

    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "booking_hold_expired", entityId: "bk1" }),
      })
    );
  });

  it("recomputes guest totals so a voided hold stops counting as a stay", async () => {
    mockFindMany.mockResolvedValueOnce([stale]);
    await expireStalePaymentHolds();

    expect(mockGuestUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "g1" } })
    );
  });

  it("does nothing at all when there are no stale holds", async () => {
    const result = await expireStalePaymentHolds();

    expect(result).toEqual({ expired: 0, retained: 0 });
    expect(mockUpdateMany).not.toHaveBeenCalled();
    expect(mockGuestUpdate).not.toHaveBeenCalled();
  });
});
