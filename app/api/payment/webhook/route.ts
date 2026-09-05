import { NextRequest } from "next/server";
import { z } from "zod";
import { verifyWebhookSignature, webhookSecretConfigured } from "@/lib/razorpay";
import { findBookingIdByOrder, settlePayment } from "@/lib/payment-settlement";
import { ok, okMessage, fail } from "@/lib/api-response";

/**
 * Razorpay telling us, server to server, that money was captured.
 *
 * Why this exists: `/api/payment/verify` is driven entirely by the guest's
 * browser. If they close the tab as the modal completes, lose signal on the
 * hill road, or that request 500s, Razorpay has the money and the booking sits
 * `pending` with no `Payment` row — so the stay is missing from every revenue
 * report until someone reads a log line. `expireStalePaymentHolds()` covers
 * half of it (it asks Razorpay, is told "paid", and keeps the room) but nothing
 * confirmed the booking or emailed the guest. This is the half that was missing.
 *
 * It deliberately does *not* re-implement settlement. Both paths call
 * `settlePayment`, so a payment settles identically whichever arrives first —
 * and both usually do arrive, seconds apart, which is why that function is
 * built to be called twice.
 *
 * ── Status codes are a contract with Razorpay's retry machinery ──────────
 * Razorpay retries a delivery on any non-2xx, backing off over ~24 hours. So a
 * 2xx here means "decided, do not send this again" — including the outcomes
 * that are bad news for the guest, because a payment recorded for refund is a
 * settled question and redelivering it changes nothing. Only a genuinely
 * transient failure (the database is unreachable) is allowed to 5xx, because
 * that is the case where a retry is exactly what we want.
 */

/** Both `payment.captured` and `order.paid` carry the payment entity. */
const WebhookBody = z.object({
  event: z.string(),
  payload: z.object({
    payment: z.object({
      entity: z.object({
        id: z.string(),
        order_id: z.string().nullable().optional(),
      }),
    }).optional(),
  }),
});

/**
 * Money that is actually ours.
 *
 * `payment.authorized` is deliberately absent: an authorised-but-uncaptured
 * payment is a hold on the guest's card, not a payment, and confirming a stay
 * against one would promise a room for money that may never arrive.
 */
const SETTLING_EVENTS = new Set(["payment.captured", "order.paid"]);

export async function POST(req: NextRequest) {
  // The signature is an HMAC over the bytes as sent, so the raw text has to be
  // read before anything parses it. `JSON.parse` then `JSON.stringify` reorders
  // keys and the digest never matches.
  const raw = await req.text();

  // Fails shut, like CRON_SECRET and JWT_SECRET. An unconfigured deployment
  // must not accept unauthenticated writes to booking payment state — and a
  // 503 says "we are dropping deliveries you are making correctly", which is a
  // different problem for whoever reads the log than a bad signature.
  if (!webhookSecretConfigured()) {
    console.error("[payment/webhook] RAZORPAY_WEBHOOK_SECRET is not configured — refusing the delivery");
    return fail("Webhooks are not configured on this deployment", 503);
  }

  if (!verifyWebhookSignature(raw, req.headers.get("x-razorpay-signature"))) {
    console.error("[payment/webhook] rejected a delivery with a bad or missing signature");
    return fail("Invalid webhook signature", 401);
  }

  // Parsed inside the guard, not around it. A signed body should always be
  // valid JSON — the signature is over these very bytes — but an unhandled
  // SyntaxError here is a 500, and a 500 is Razorpay's cue to redeliver the
  // same unparseable body for the next 24 hours.
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    console.error("[payment/webhook] signed delivery was not valid JSON — ignoring");
    return okMessage("Ignored: unparseable payload");
  }

  const parsed = WebhookBody.safeParse(body);
  if (!parsed.success) {
    // Signed by Razorpay but not a shape we know. Accepting it stops the
    // retries for something no redelivery will fix.
    console.error("[payment/webhook] signed delivery in an unrecognised shape — ignoring");
    return okMessage("Ignored: unrecognised payload");
  }

  const { event, payload } = parsed.data;

  // Razorpay sends whatever the dashboard subscribes to, and subscriptions get
  // widened by hand. Anything we do not act on is acknowledged, not retried.
  if (!SETTLING_EVENTS.has(event)) {
    return okMessage(`Ignored: ${event}`);
  }

  const payment = payload.payment?.entity;
  if (!payment?.order_id) {
    console.error(`[payment/webhook] ${event} carried no order id — cannot resolve a booking`);
    return okMessage("Ignored: no order id");
  }

  // The webhook knows an order, not a booking. Resolving through
  // `razorpayOrderId` is the same binding /api/payment/verify checks the
  // browser's claim against, so neither path can settle money against a
  // booking it does not belong to.
  const bookingId = await findBookingIdByOrder(payment.order_id);
  if (!bookingId) {
    // A payment for an order this database has never heard of — a test payment
    // from the dashboard, or a webhook still pointed at an old deployment.
    // Nothing to do, and no amount of retrying will produce a booking.
    console.error(
      `[payment/webhook] ${event} for order ${payment.order_id}, which matches no booking — ignoring`
    );
    return okMessage("Ignored: no booking for that order");
  }

  const result = await settlePayment({
    bookingId,
    razorpayOrderId: payment.order_id,
    razorpayPaymentId: payment.id,
    // A webhook signature covers the delivery, not the (order, payment) pair,
    // so there is no per-payment signature to store. Recording the delivery
    // digest here would look like a checkout signature and verify as nothing.
    razorpaySignature: null,
    source: "webhook",
  });

  // Every branch is 2xx: all of them are decided. The two that are not simply
  // "confirmed" get a log line, because they are the ones a human may need to
  // act on.
  switch (result.status) {
    case "confirmed":
      console.log(`[payment/webhook] confirmed ${result.bookingNumber} from ${event}`);
      return ok({ bookingNumber: result.bookingNumber, settled: true });

    case "already_settled":
      // The overwhelmingly common case: the guest's browser got here first.
      return ok({ bookingNumber: result.bookingNumber, settled: false });

    case "unconfirmable":
      console.error(
        `[payment/webhook] ${result.bookingNumber} took a payment it cannot honour — ` +
          `recorded for refund. Acknowledging so Razorpay stops retrying.`
      );
      return okMessage("Recorded for refund");

    case "order_mismatch":
    case "not_found":
      // Unreachable in practice — the booking was just looked up *by* this
      // order id — but a booking deleted in the microseconds between would land
      // here, and it is still not something a retry fixes.
      console.error(`[payment/webhook] could not settle order ${payment.order_id}: ${result.status}`);
      return okMessage(`Ignored: ${result.status}`);
  }
}
