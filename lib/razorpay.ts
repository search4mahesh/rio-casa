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

/**
 * Verify a Razorpay **webhook** delivery.
 *
 * A different secret and a different payload from `verifySignature` above, and
 * the two must not be confused:
 *
 * - The checkout signature is an HMAC over `orderId|paymentId`, keyed by
 *   `RAZORPAY_KEY_SECRET`. It comes back through the guest's browser.
 * - A webhook signature is an HMAC over the **raw request body**, keyed by
 *   `RAZORPAY_WEBHOOK_SECRET` — the value entered when the webhook is created
 *   in the Razorpay dashboard. It arrives server to server.
 *
 * The body must be the bytes as sent. `JSON.parse` followed by
 * `JSON.stringify` reorders keys and drops whitespace, and the HMAC then never
 * matches — so callers read `await req.text()` and parse only after this
 * returns true.
 *
 * Returns false rather than throwing on a malformed or absent signature: an
 * unverified delivery is simply not one we act on. Missing configuration is
 * the caller's business to distinguish, via `webhookSecretConfigured()`.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

  // Constant-time, so a caller cannot learn the expected digest a byte at a
  // time from how long the comparison takes. `timingSafeEqual` throws on a
  // length mismatch, which is itself an early exit — the length check has to
  // come first, and a wrong-length signature is wrong anyway.
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Whether this deployment is configured to accept webhooks at all.
 *
 * Separated from verification so the route can answer "not configured" with a
 * 503 rather than a 401. The distinction matters to whoever is reading the
 * logs: a 401 means someone sent us a bad signature, a 503 means we are
 * dropping deliveries Razorpay is making correctly.
 */
export function webhookSecretConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_WEBHOOK_SECRET);
}
