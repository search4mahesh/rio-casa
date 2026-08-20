import Razorpay from "razorpay";
import crypto from "crypto";

export const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export async function createOrder(amountInPaise: number, bookingId: string) {
  return razorpay.orders.create({
    amount: amountInPaise,
    currency: "INR",
    receipt: `booking_${bookingId}`,
    notes: { bookingId },
  });
}

export function verifySignature(
  orderId: string,
  paymentId: string,
  signature: string
): boolean {
  const body = `${orderId}|${paymentId}`;
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
    .update(body)
    .digest("hex");
  return expected === signature;
}

/**
 * `"unknown"` is deliberately distinct from `"unpaid"`.
 *
 * The only caller is the stale-hold sweeper, which cancels bookings. Treating
 * an API outage as "unpaid" would let a network blip cancel a stay the guest
 * has already paid for — the one outcome worse than the held room the sweeper
 * exists to release. Callers must fail safe on `"unknown"` and leave the hold
 * standing.
 */
export type OrderPaymentState = "paid" | "unpaid" | "unknown";

export async function fetchOrderPaymentState(orderId: string): Promise<OrderPaymentState> {
  try {
    const order = await razorpay.orders.fetch(orderId);
    // Razorpay order status is created → attempted → paid. `amount_paid` is
    // checked as well so a partially captured order still counts as money
    // received rather than something to cancel.
    if (order.status === "paid" || Number(order.amount_paid ?? 0) > 0) return "paid";
    return "unpaid";
  } catch (err) {
    console.error(`[razorpay] could not fetch order ${orderId}:`, err);
    return "unknown";
  }
}
