/**
 * `/api/payment/verify` used to be the only path to `paid`, and it runs in the
 * guest's browser. A closed tab, a dropped connection on the hill road, or one
 * 500 from that route meant Razorpay had the money and the booking sat
 * `pending` — absent from every revenue report until a human read a log line.
 *
 * The webhook is the path that does not depend on the guest's browser. These
 * tests pin the two things it is responsible for: proving a delivery really
 * came from Razorpay, and answering in a way that makes Razorpay's retry
 * machinery do the right thing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import crypto from "crypto";

const { mockSettle, mockFindByOrder } = vi.hoisted(() => ({
  mockSettle: vi.fn(),
  mockFindByOrder: vi.fn(),
}));

// Settlement itself is covered by payment-verify.test.ts — it is the *same*
// function, which is the point of the shared module. What is under test here is
// only what the route decides around it.
vi.mock("@/lib/payment-settlement", () => ({
  settlePayment: mockSettle,
  findBookingIdByOrder: mockFindByOrder,
  UNCONFIRMABLE_ERROR: "unconfirmable",
}));

import { POST } from "@/app/api/payment/webhook/route";
// Deliberately NOT mocked: the signature check is the security boundary, so it
// is exercised with real HMACs.
import { verifyWebhookSignature } from "@/lib/razorpay";

const SECRET = "whsec_test_value";

const CAPTURED = {
  event: "payment.captured",
  payload: { payment: { entity: { id: "pay_live", order_id: "order_live" } } },
};

function sign(raw: string, secret = SECRET) {
  return crypto.createHmac("sha256", secret).update(raw).digest("hex");
}

/** A delivery as Razorpay sends it: raw JSON plus a header over those bytes. */
function delivery(body: unknown, signature?: string | null) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const headers: Record<string, string> = { "content-type": "application/json" };
  const sig = signature === undefined ? sign(raw) : signature;
  if (sig !== null) headers["x-razorpay-signature"] = sig;
  return new NextRequest("http://localhost/api/payment/webhook", {
    method: "POST",
    headers,
    body: raw,
  });
}

beforeEach(() => {
  process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;
  mockSettle.mockReset().mockResolvedValue({
    status: "confirmed",
    bookingId: "bk_1",
    bookingNumber: "BK-20260901-001",
  });
  mockFindByOrder.mockReset().mockResolvedValue("bk_1");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.RAZORPAY_WEBHOOK_SECRET;
});

describe("verifyWebhookSignature", () => {
  it("accepts an HMAC of the exact bytes sent", () => {
    const raw = JSON.stringify(CAPTURED);
    expect(verifyWebhookSignature(raw, sign(raw))).toBe(true);
  });

  it("rejects a body that was altered after signing", () => {
    const raw = JSON.stringify(CAPTURED);
    const tampered = raw.replace("pay_live", "pay_forged");
    expect(verifyWebhookSignature(tampered, sign(raw))).toBe(false);
  });

  it("rejects a signature made with a different secret", () => {
    const raw = JSON.stringify(CAPTURED);
    expect(verifyWebhookSignature(raw, sign(raw, "not_the_secret"))).toBe(false);
  });

  it("rejects a missing signature rather than treating absence as a pass", () => {
    expect(verifyWebhookSignature("{}", null)).toBe(false);
  });

  it("refuses everything when no secret is configured", () => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    const raw = JSON.stringify(CAPTURED);
    // Even a signature that would be valid if the secret were set.
    expect(verifyWebhookSignature(raw, sign(raw))).toBe(false);
  });

  it("returns false, not a throw, for a wrong-length signature", () => {
    // `crypto.timingSafeEqual` throws when the buffers differ in length, so the
    // length check has to come first or a short signature 500s the route.
    expect(() => verifyWebhookSignature("{}", "abc")).not.toThrow();
    expect(verifyWebhookSignature("{}", "abc")).toBe(false);
  });
});

describe("POST /api/payment/webhook — authenticating the delivery", () => {
  it("503s and settles nothing when the secret is not configured", async () => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    const res = await POST(delivery(CAPTURED, "any"));

    expect(res.status).toBe(503);
    expect(mockSettle).not.toHaveBeenCalled();
  });

  it("401s an unsigned delivery", async () => {
    const res = await POST(delivery(CAPTURED, null));

    expect(res.status).toBe(401);
    expect(mockSettle).not.toHaveBeenCalled();
  });

  it("401s a forged delivery", async () => {
    const raw = JSON.stringify(CAPTURED);
    const res = await POST(delivery(raw, sign(raw, "attacker_secret")));

    expect(res.status).toBe(401);
    expect(mockSettle).not.toHaveBeenCalled();
  });

  it("verifies the raw bytes, not a re-serialisation of the parsed body", async () => {
    // Key order and whitespace differ from what `JSON.stringify(parsed)` would
    // produce. Verifying a round-tripped body instead of the bytes as sent
    // would reject this genuine delivery.
    const raw = '{"payload":{"payment":{"entity":{"order_id":"order_live","id":"pay_live"}}},  "event":"payment.captured"}';
    const res = await POST(delivery(raw));

    expect(res.status).toBe(200);
    expect(mockSettle).toHaveBeenCalledOnce();
  });
});

describe("POST /api/payment/webhook — what it acts on", () => {
  it("settles a captured payment against the booking holding that order", async () => {
    const res = await POST(delivery(CAPTURED));

    expect(res.status).toBe(200);
    expect(mockFindByOrder).toHaveBeenCalledWith("order_live");
    expect(mockSettle).toHaveBeenCalledWith({
      bookingId: "bk_1",
      razorpayOrderId: "order_live",
      razorpayPaymentId: "pay_live",
      // A webhook signature covers the delivery, not the (order, payment) pair,
      // so there is no checkout-style signature to record.
      razorpaySignature: null,
      source: "webhook",
    });
  });

  it("settles order.paid the same way", async () => {
    const res = await POST(delivery({ ...CAPTURED, event: "order.paid" }));

    expect(res.status).toBe(200);
    expect(mockSettle).toHaveBeenCalledOnce();
  });

  it("ignores payment.authorized — an uncaptured hold is not money", async () => {
    // Confirming a stay against an authorisation promises a room for money that
    // may never be captured.
    const res = await POST(delivery({ ...CAPTURED, event: "payment.authorized" }));

    expect(res.status).toBe(200);
    expect(mockSettle).not.toHaveBeenCalled();
  });

  it("ignores an event for an order no booking holds", async () => {
    mockFindByOrder.mockResolvedValue(null);
    const res = await POST(delivery(CAPTURED));

    // A dashboard test payment, or a webhook still pointed at an old
    // deployment. 200, because no redelivery will conjure a booking.
    expect(res.status).toBe(200);
    expect(mockSettle).not.toHaveBeenCalled();
  });

  it("ignores a signed delivery that is not valid JSON", async () => {
    // Should not happen — the signature covers these bytes — but letting a
    // SyntaxError escape would 500, and Razorpay reads a 500 as "redeliver this
    // unparseable body for the next 24 hours".
    const res = await POST(delivery("not json at all"));

    expect(res.status).toBe(200);
    expect(mockSettle).not.toHaveBeenCalled();
  });

  it("ignores a signed delivery in an unrecognised shape", async () => {
    const res = await POST(delivery({ event: "payment.captured", payload: {} }));

    expect(res.status).toBe(200);
    expect(mockSettle).not.toHaveBeenCalled();
  });
});

describe("POST /api/payment/webhook — the retry contract", () => {
  it("acknowledges a payment the browser already settled", async () => {
    // The common case: both paths fire, the browser wins by a second.
    mockSettle.mockResolvedValue({
      status: "already_settled",
      bookingId: "bk_1",
      bookingNumber: "BK-20260901-001",
    });
    const res = await POST(delivery(CAPTURED));

    expect(res.status).toBe(200);
    expect((await res.json()).data.settled).toBe(false);
  });

  it("acknowledges an unconfirmable payment instead of asking for a retry", async () => {
    // The money is recorded for refund. That is a decided outcome — answering
    // 409 here (as the guest-facing route rightly does) would make Razorpay
    // redeliver it for 24 hours, and every redelivery would decide the same.
    mockSettle.mockResolvedValue({ status: "unconfirmable", bookingNumber: "BK-20260901-001" });
    const res = await POST(delivery(CAPTURED));

    expect(res.status).toBe(200);
  });

  it("lets a database failure escape, so Razorpay retries it", async () => {
    // The one case where a retry is exactly what we want: nothing was decided,
    // and the delivery is the only record that this payment happened.
    mockSettle.mockRejectedValue(new Error("connection terminated"));

    await expect(POST(delivery(CAPTURED))).rejects.toThrow("connection terminated");
  });
});
