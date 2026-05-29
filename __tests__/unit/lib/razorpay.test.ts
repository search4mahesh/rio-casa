import { describe, it, expect, vi } from "vitest";
import crypto from "crypto";

// Prevent Razorpay constructor from throwing — key_id is not needed for verifySignature
vi.mock("razorpay", () => ({
  default: function RazorpayMock() { return {}; },
}));

import { verifySignature } from "@/lib/razorpay";

function makeSignature(orderId: string, paymentId: string, secret: string) {
  return crypto
    .createHmac("sha256", secret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
}

const SECRET = process.env.RAZORPAY_KEY_SECRET!;

describe("verifySignature", () => {
  it("returns true for a valid HMAC signature", () => {
    const orderId = "order_abc123";
    const paymentId = "pay_xyz789";
    const sig = makeSignature(orderId, paymentId, SECRET);
    expect(verifySignature(orderId, paymentId, sig)).toBe(true);
  });

  it("returns false when paymentId is tampered", () => {
    const orderId = "order_abc123";
    const paymentId = "pay_xyz789";
    const sig = makeSignature(orderId, paymentId, SECRET);
    expect(verifySignature(orderId, "pay_TAMPERED", sig)).toBe(false);
  });

  it("returns false when orderId is tampered", () => {
    const orderId = "order_abc123";
    const paymentId = "pay_xyz789";
    const sig = makeSignature(orderId, paymentId, SECRET);
    expect(verifySignature("order_TAMPERED", paymentId, sig)).toBe(false);
  });

  it("returns false when signature is completely wrong", () => {
    expect(verifySignature("order_abc", "pay_xyz", "deadbeef")).toBe(false);
  });

  it("returns false for empty strings", () => {
    expect(verifySignature("", "", "")).toBe(false);
  });
});
