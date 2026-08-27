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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const {
  mockFindUnique, mockUpdate, mockPaymentCreate, mockAuditCreate, mockResendSend,
  mockTxUpdateMany, mockGuard, mockRecalcTotals, mockUpdateMany, mockFindMany,
  mockAggregate, mockGroupUpdate,
} = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  // The email re-read. The paying write is `updateMany` — one statement for
  // every room in the party.
  mockUpdate: vi.fn(),
  mockUpdateMany: vi.fn().mockResolvedValue({ count: 1 }),
  mockFindMany: vi.fn().mockResolvedValue([]),
  mockAggregate: vi.fn().mockResolvedValue({ _sum: { cgstAmount: 660, sgstAmount: 660 } }),
  mockGroupUpdate: vi.fn().mockResolvedValue({}),
  mockPaymentCreate: vi.fn().mockResolvedValue({}),
  mockAuditCreate: vi.fn().mockResolvedValue({}),
  mockResendSend: vi.fn().mockResolvedValue({ data: { id: "msg_1" }, error: null }),
  // The reinstatement transaction: the room lock + re-check, then the
  // compare-and-swap that brings the booking back.
  mockTxUpdateMany: vi.fn(),
  mockGuard: vi.fn(),
  mockRecalcTotals: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    booking: {
      findUnique: mockFindUnique,
      findUniqueOrThrow: mockUpdate,
      findMany: mockFindMany,
      updateMany: mockUpdateMany,
      aggregate: mockAggregate,
    },
    bookingGroup: { update: mockGroupUpdate },
    payment: { create: mockPaymentCreate },
    auditLog: { create: mockAuditCreate },
    // Callback form for the reinstatement transaction, array form for the
    // orphaned-payment record.
    $transaction: vi.fn(async (arg: unknown) =>
      typeof arg === "function"
        ? await (arg as (tx: unknown) => Promise<unknown>)({
            booking: { updateMany: mockTxUpdateMany },
          })
        : await Promise.all(arg as Promise<unknown>[])
    ),
  },
}));

vi.mock("@/lib/razorpay", () => ({
  // Every request in these tests carries a *genuine* signature. The question
  // under test is only ever "does this payment belong to this booking?".
  verifySignature: vi.fn().mockReturnValue(true),
}));

vi.mock("@/lib/booking-service", () => ({
  syncWithChannelManager: vi.fn().mockResolvedValue(undefined),
  guardRoomsAvailability: mockGuard,
  recalcGuestTotals: mockRecalcTotals,
  BOOKING_TX_OPTIONS: {},
  // The real one only retries transient failures; here it is transparent so a
  // thrown ROOM_NOT_AVAILABLE surfaces immediately.
  withSerializableRetry: vi.fn((run: () => Promise<unknown>) => run()),
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

/** The guest paying for their *own* booking — order and payment both belong to it. */
const VALID_OWN = {
  bookingId: "bk_target",
  razorpayOrderId: "order_target",
  razorpayPaymentId: "pay_own",
  razorpaySignature: "sig",
};

function post(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/payment/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * A booking as the route selects it. Check-in is deliberately well in the
 * future: reinstating a cancelled booking is only attempted for a stay that
 * has not started yet.
 */
function booking(over: Record<string, unknown> = {}) {
  return {
    id: "bk_target",
    bookingNumber: "BK-20260815-001",
    razorpayOrderId: "order_target",
    razorpayPaymentId: null,
    paymentStatus: "pending",
    status: "confirmed",
    guestId: "guest_1",
    // A lone booking, not one room of a party. A group id sends the route to
    // fetch the siblings and settle all of them together.
    groupId: null,
    roomId: "room_1",
    checkIn: new Date("2027-03-10T00:00:00.000Z"),
    checkOut: new Date("2027-03-12T00:00:00.000Z"),
    totalAmount: 12980,
    ...over,
  };
}

beforeEach(() => {
  mockFindUnique.mockReset();
  mockUpdate.mockReset();
  mockUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  mockFindMany.mockReset().mockResolvedValue([]);
  mockAggregate.mockReset().mockResolvedValue({ _sum: { cgstAmount: 660, sgstAmount: 660 } });
  mockGroupUpdate.mockClear();
  mockPaymentCreate.mockClear();
  mockAuditCreate.mockClear();
  mockResendSend.mockReset();
  mockResendSend.mockResolvedValue({ data: { id: "msg_1" }, error: null });
  mockGuard.mockReset();
  mockGuard.mockResolvedValue(undefined);        // room free unless a test says otherwise
  mockTxUpdateMany.mockReset();
  mockTxUpdateMany.mockResolvedValue({ count: 1 });
  mockRecalcTotals.mockClear();
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
    expect(mockUpdateMany).not.toHaveBeenCalled();
    expect(mockPaymentCreate).not.toHaveBeenCalled();
  });

  it("marks the booking paid when the order does belong to it", async () => {
    mockFindUnique.mockResolvedValueOnce(booking());

    const res = await POST(post({ ...VALID, razorpayOrderId: "order_target" }));
    expect(res.status).toBe(200);

    expect(mockUpdateMany).toHaveBeenCalledWith(
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
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown bookingId rather than throwing", async () => {
    mockFindUnique.mockResolvedValueOnce(null);

    const res = await POST(post(VALID));
    expect(res.status).toBe(404);
    expect(mockUpdateMany).not.toHaveBeenCalled();
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

    expect(mockUpdateMany).not.toHaveBeenCalled();
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

/**
 * B-38. The signature is genuine and the order really does belong to this
 * booking — but the booking is gone. The guest left the Razorpay modal open
 * past BOOKING_HOLD_MINUTES, `expireStalePaymentHolds()` asked Razorpay, was
 * told "unpaid" (true at that instant), cancelled the booking and released the
 * room; then the guest paid.
 *
 * The route used to select `paymentStatus` but never `status`, so it could not
 * tell the difference: it marked the cancelled booking paid, wrote a Payment
 * row, and emailed "Booking Confirmed!" for a stay whose room was already back
 * on the calendar — while the confirmation page told the same guest the
 * booking did not go through.
 */
describe("POST /api/payment/verify — payment lands after the hold expired (B-38)", () => {
  const CANCELLED = { status: "cancelled", paymentStatus: "failed" };

  // The confirmation email is gated on RESEND_API_KEY. Set it here so the
  // "did not email" assertions below are actually testing the route's
  // decision rather than an unset key.
  beforeEach(() => { process.env.RESEND_API_KEY = "re_test"; });
  afterEach(() => { delete process.env.RESEND_API_KEY; });

  it("reinstates the booking when the room is still free, and confirms it properly", async () => {
    mockFindUnique.mockResolvedValueOnce(booking(CANCELLED));

    const res = await POST(post(VALID_OWN));
    expect(res.status).toBe(200);

    // It went through the same room lock + availability re-check every other
    // booking path uses, rather than just flipping the row back.
    expect(mockGuard).toHaveBeenCalledTimes(1);
    // An array: reinstatement takes every room in the party in one ordered
    // pass, so a party comes back whole or not at all.
    expect(mockGuard.mock.calls[0][1]).toEqual(["room_1"]);

    // Brought back as a live, paid booking — compare-and-swap on the status we
    // read, so a concurrent change loses.
    const cas = mockTxUpdateMany.mock.calls[0][0];
    expect(cas.where).toMatchObject({ id: "bk_target", status: "cancelled" });
    expect(cas.data).toMatchObject({
      status: "confirmed",
      paymentStatus: "paid",
      cancelledAt: null,
      cancellationReason: null,
    });

    // The sweeper decremented the guest's totals when it cancelled.
    expect(mockRecalcTotals).toHaveBeenCalled();
    // Now genuinely confirmed, so the confirmation email is correct.
    expect(mockResendSend).toHaveBeenCalledTimes(1);
  });

  it("does NOT confirm or email when the room has gone to someone else", async () => {
    mockFindUnique.mockResolvedValueOnce(booking(CANCELLED));
    mockGuard.mockRejectedValueOnce(new Error("ROOM_NOT_AVAILABLE"));

    const res = await POST(post(VALID_OWN));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.success).toBe(false);
    // The bug: this used to be a 200 with the booking marked paid.
    expect(mockUpdateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ paymentStatus: "paid" }) })
    );
    // ...and the guest used to be told their stay was confirmed.
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it("still records the money so it can be refunded, and tags it as needing one", async () => {
    mockFindUnique.mockResolvedValueOnce(booking(CANCELLED));
    mockGuard.mockRejectedValueOnce(new Error("ROOM_NOT_AVAILABLE"));

    await POST(post(VALID_OWN));

    // Visible in Payment History on the booking page, which is where staff look.
    expect(mockPaymentCreate).toHaveBeenCalledTimes(1);
    const payment = mockPaymentCreate.mock.calls[0][0].data;
    expect(payment).toMatchObject({
      bookingId: "bk_target",
      amount: 12980,
      razorpayPaymentId: "pay_own",
      status: "completed",
    });
    expect(payment.notes).toMatch(/refund or rebook/i);

    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "payment_received_for_cancelled_booking",
          newValue: expect.objectContaining({ needsRefund: true }),
        }),
      })
    );
  });

  it("does not reinstate a stay that has already started — that is a refund, not a check-in", async () => {
    mockFindUnique.mockResolvedValueOnce(
      booking({ status: "no_show", paymentStatus: "failed", checkIn: new Date("2020-01-01T00:00:00.000Z") })
    );

    const res = await POST(post(VALID_OWN));

    expect(res.status).toBe(409);
    expect(mockGuard).not.toHaveBeenCalled();   // never even reaches for the room
    expect(mockResendSend).not.toHaveBeenCalled();
    expect(mockPaymentCreate).toHaveBeenCalledTimes(1);
  });

  it("is idempotent: replaying the same triple writes no second payment row", async () => {
    // The state `recordUnmatchedPayment` leaves behind: still cancelled, but
    // the payment id is now on the row.
    mockFindUnique.mockResolvedValueOnce(
      booking({ ...CANCELLED, razorpayPaymentId: "pay_own" })
    );

    const res = await POST(post(VALID_OWN));

    expect(res.status).toBe(409);
    expect(mockPaymentCreate).not.toHaveBeenCalled();
    expect(mockGuard).not.toHaveBeenCalled();
  });

  it("loses cleanly when something else reinstates or re-cancels first", async () => {
    mockFindUnique.mockResolvedValueOnce(booking(CANCELLED));
    mockTxUpdateMany.mockResolvedValueOnce({ count: 0 });   // CAS matched nothing

    const res = await POST(post(VALID_OWN));

    expect(res.status).toBe(409);
    expect(mockResendSend).not.toHaveBeenCalled();
    expect(mockPaymentCreate).toHaveBeenCalledTimes(1);
  });
});
