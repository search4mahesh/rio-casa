/**
 * The Razorpay signature proves that Razorpay authorised a given
 * (order, payment) pair. It proves nothing about which booking that pair
 * belongs to.
 *
 * This route used to take the signature as sufficient and update whatever
 * `bookingId` the request named, which meant anyone who had ever completed a
 * booking held a reusable token for marking *any* booking paid: pay ₹2,000 for
 * the cheapest room, keep the triple the checkout handler receives, replay it
 * against a different id. These tests pin the binding shut.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockFindUnique, mockUpdate, mockPaymentCreate, mockAuditCreate, mockResendSend } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockUpdate: vi.fn(),
  mockPaymentCreate: vi.fn().mockResolvedValue({}),
  mockAuditCreate: vi.fn().mockResolvedValue({}),
  mockResendSend: vi.fn().mockResolvedValue({ data: { id: "msg_1" }, error: null }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    booking: { findUnique: mockFindUnique, update: mockUpdate },
    payment: { create: mockPaymentCreate },
    auditLog: { create: mockAuditCreate },
  },
}));

vi.mock("@/lib/razorpay", () => ({
  // Every request in these tests carries a *genuine* signature. The question
  // under test is only ever "does this payment belong to this booking?".
  verifySignature: vi.fn().mockReturnValue(true),
}));

vi.mock("@/lib/booking-service", () => ({
  syncWithChannelManager: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mockResendSend };
  },
}));

import { POST } from "@/app/api/payment/verify/route";
import { verifySignature } from "@/lib/razorpay";

const VALID = {
  bookingId: "bk_target",
  razorpayOrderId: "order_attacker",
  razorpayPaymentId: "pay_attacker",
  razorpaySignature: "sig",
};

function post(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/payment/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** A booking as the route selects it. */
function booking(over: Record<string, unknown> = {}) {
  return {
    id: "bk_target",
    bookingNumber: "BK-20260815-001",
    razorpayOrderId: "order_target",
    razorpayPaymentId: null,
    paymentStatus: "pending",
    ...over,
  };
}

beforeEach(() => {
  mockFindUnique.mockReset();
  mockUpdate.mockReset();
  mockPaymentCreate.mockClear();
  mockAuditCreate.mockClear();
  mockResendSend.mockReset();
  mockResendSend.mockResolvedValue({ data: { id: "msg_1" }, error: null });
  vi.mocked(verifySignature).mockReturnValue(true);
  mockUpdate.mockResolvedValue({
    id: "bk_target",
    bookingNumber: "BK-20260815-001",
    totalAmount: 12980,
    guestEmail: "guest@example.com",
    guestName: "Guest",
    nights: 2,
    adults: 2,
    children: 0,
    cgstAmount: 660,
    sgstAmount: 660,
    checkIn: new Date("2026-08-15T00:00:00.000Z"),
    checkOut: new Date("2026-08-17T00:00:00.000Z"),
    specialRequests: null,
    room: { name: "Deluxe" },
  });
});

describe("POST /api/payment/verify — order/booking binding", () => {
  it("refuses a valid signature for an order that belongs to a different booking", async () => {
    mockFindUnique.mockResolvedValueOnce(booking({ razorpayOrderId: "order_target" }));

    const res = await POST(post(VALID)); // presents order_attacker
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.success).toBe(false);
    // Nothing may be written — this is the whole point.
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockPaymentCreate).not.toHaveBeenCalled();
  });

  it("marks the booking paid when the order does belong to it", async () => {
    mockFindUnique.mockResolvedValueOnce(booking());

    const res = await POST(post({ ...VALID, razorpayOrderId: "order_target" }));
    expect(res.status).toBe(200);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ paymentStatus: "paid" }),
      })
    );
    expect(mockPaymentCreate).toHaveBeenCalledOnce();
  });

  it("refuses a booking that never had an order attached", async () => {
    mockFindUnique.mockResolvedValueOnce(booking({ razorpayOrderId: null }));

    const res = await POST(post({ ...VALID, razorpayOrderId: "order_target" }));
    expect(res.status).toBe(403);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown bookingId rather than throwing", async () => {
    mockFindUnique.mockResolvedValueOnce(null);

    const res = await POST(post(VALID));
    expect(res.status).toBe(404);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("still rejects a forged signature before looking anything up", async () => {
    vi.mocked(verifySignature).mockReturnValue(false);

    const res = await POST(post(VALID));
    expect(res.status).toBe(400);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });
});

describe("POST /api/payment/verify — replay of a booking's own triple", () => {
  it("is idempotent: no second payment row, no double-counted revenue", async () => {
    mockFindUnique.mockResolvedValueOnce(
      booking({ paymentStatus: "paid", razorpayPaymentId: "pay_attacker" })
    );

    const res = await POST(post({ ...VALID, razorpayOrderId: "order_target" }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.bookingNumber).toBe("BK-20260815-001");

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockPaymentCreate).not.toHaveBeenCalled();
  });

  it("still processes a different payment against an already-paid booking", async () => {
    // Same order, new payment id — a genuine second capture, not a replay.
    mockFindUnique.mockResolvedValueOnce(
      booking({ paymentStatus: "paid", razorpayPaymentId: "pay_first" })
    );

    const res = await POST(
      post({ ...VALID, razorpayOrderId: "order_target", razorpayPaymentId: "pay_second" })
    );
    expect(res.status).toBe(200);
    expect(mockPaymentCreate).toHaveBeenCalledOnce();
  });
});

describe("POST /api/payment/verify — confirmation email", () => {
  it("confirms the payment even when the email cannot be sent", async () => {
    // A Resend outage used to 500 the route *after* the payment was recorded,
    // which the wizard reads as "we could not confirm your booking" and shows
    // to a guest whose stay is, in fact, confirmed.
    process.env.RESEND_API_KEY = "re_test";
    mockFindUnique.mockResolvedValueOnce(booking());
    mockResendSend.mockRejectedValueOnce(new Error("network failure"));

    const res = await POST(post({ ...VALID, razorpayOrderId: "order_target" }));
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);

    delete process.env.RESEND_API_KEY;
  });

  // B-37 — the SDK resolves `{ data: null, error }` for an API-level failure
  // (bad key, rejected recipient, …) rather than throwing; only a network
  // failure throws. A resolved-but-rejected send must be just as non-fatal to
  // the payment confirmation as a thrown one — the route now checks `.error`
  // explicitly rather than assuming a resolved promise means the email sent.
  it("confirms the payment when Resend resolves with an error, not a throw", async () => {
    process.env.RESEND_API_KEY = "re_test";
    mockFindUnique.mockResolvedValueOnce(booking());
    mockResendSend.mockResolvedValueOnce({ data: null, error: { name: "validation_error", message: "API key is invalid" } });

    const res = await POST(post({ ...VALID, razorpayOrderId: "order_target" }));
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);

    delete process.env.RESEND_API_KEY;
  });
});
