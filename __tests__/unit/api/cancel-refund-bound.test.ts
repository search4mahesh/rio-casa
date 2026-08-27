/**
 * B-44. `refundAmount` was `z.number().min(0)` with no upper bound, so a
 * mistyped figure — an extra zero, transposed digits — was stored as-is and
 * rendered on the booking page as fact, with nothing anywhere to catch it.
 *
 * This is the twin of B-26, which capped walk-in `amountPaid` against the
 * booking total for exactly the same reason. A refund cannot be worth more
 * than the stay it refunds.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockBookingFindUnique, mockTransaction, mockGuestUpdate, mockAggregate } = vi.hoisted(() => ({
  mockBookingFindUnique: vi.fn(),
  mockTransaction: vi.fn().mockResolvedValue([]),
  mockGuestUpdate: vi.fn().mockResolvedValue({}),
  mockAggregate: vi.fn().mockResolvedValue({ _count: { _all: 0 }, _sum: { totalAmount: 0 } }),
}));

vi.mock("@/lib/admin-auth", () => ({
  verifyAdminToken: vi.fn().mockResolvedValue({ staffId: "s1", role: "owner", name: "Admin", email: "a@a.com" }),
  resolveActiveStaff: vi.fn().mockResolvedValue({ staffId: "s1", role: "owner", name: "Admin", email: "a@a.com" }),
  ADMIN_COOKIE: "admin_token",
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    booking: {
      findUnique: mockBookingFindUnique,
      update: vi.fn().mockResolvedValue({}),
      aggregate: mockAggregate,
    },
    guest: { update: mockGuestUpdate },
    roomStatus: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    $transaction: mockTransaction,
  },
}));

import { PATCH as cancel } from "@/app/api/admin/bookings/[id]/cancel/route";

function req(body: Record<string, unknown>) {
  const r = new NextRequest("http://localhost/api/admin/bookings/bk1/cancel", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  r.cookies.set("admin_token", "mock_token");
  return r;
}

const params = { id: "bk1" };

beforeEach(() => {
  vi.clearAllMocks();
  mockTransaction.mockResolvedValue([]);
  mockAggregate.mockResolvedValue({ _count: { _all: 0 }, _sum: { totalAmount: 0 } });
  mockBookingFindUnique.mockResolvedValue({
    id: "bk1",
    bookingNumber: "BK-20260815-001",
    status: "confirmed",
    guestId: "g1",
    roomId: "r1",
    totalAmount: 11800,
  });
});

describe("PATCH /api/admin/bookings/[id]/cancel — refund bound (B-44)", () => {
  it("refuses a refund larger than the booking total", async () => {
    // The classic fat-finger: an extra zero on an ₹11,800 stay.
    const res = await cancel(req({ reason: "Guest cancelled", refundAmount: 118000 }), { params });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/more than the booking total/i);
    // Nothing may be written — the cancellation itself must not go through
    // with a bad figure attached.
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("allows a refund equal to the total", async () => {
    const res = await cancel(req({ refundAmount: 11800 }), { params });

    expect(res.status).toBe(200);
    expect(mockTransaction).toHaveBeenCalled();
  });

  it("allows a partial refund", async () => {
    const res = await cancel(req({ reason: "Late cancellation", refundAmount: 5000 }), { params });

    expect(res.status).toBe(200);
    expect(mockTransaction).toHaveBeenCalled();
  });

  it("still allows cancelling with no refund at all", async () => {
    const res = await cancel(req({ reason: "No-show, no refund due" }), { params });

    expect(res.status).toBe(200);
    expect(mockTransaction).toHaveBeenCalled();
  });

  it("still rejects a negative refund", async () => {
    const res = await cancel(req({ refundAmount: -100 }), { params });

    expect(res.status).toBe(400);
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
