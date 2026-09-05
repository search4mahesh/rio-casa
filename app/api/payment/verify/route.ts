import { NextRequest } from "next/server";
import { z } from "zod";
import { verifySignature } from "@/lib/razorpay";
import { settlePayment, UNCONFIRMABLE_ERROR } from "@/lib/payment-settlement";
import { ok, fail } from "@/lib/api-response";

/**
 * The guest's browser reporting a completed checkout.
 *
 * This route owns exactly two things: proving Razorpay authorised the
 * {order, payment} pair, and turning a settlement outcome into the status the
 * wizard expects. Everything else — the order/booking binding, the still-live
 * check, reinstatement, the party, the payment rows, the email — is in
 * `lib/payment-settlement.ts`, shared with `/api/payment/webhook`.
 *
 * It is no longer the *only* path to `paid`, which is the point of the webhook:
 * a guest who closes the tab before this fires still gets their booking
 * confirmed. It is still the fast path, and the one the guest waits on.
 */

const schema = z.object({
  bookingId: z.string(),
  razorpayOrderId: z.string(),
  razorpayPaymentId: z.string(),
  razorpaySignature: z.string(),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return fail("Invalid payload", 400);
  }

  const { bookingId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = parsed.data;

  // The signature proves Razorpay authorised *this order and payment pair*.
  // It says nothing about which booking they belong to — that binding is
  // `settlePayment`'s first check.
  if (!verifySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
    return fail("Payment verification failed", 400);
  }

  const result = await settlePayment({
    bookingId,
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
    source: "checkout",
  });

  switch (result.status) {
    case "confirmed":
    case "already_settled":
      return ok({ bookingId: result.bookingId, bookingNumber: result.bookingNumber });
    case "not_found":
      return fail("Booking not found", 404);
    case "order_mismatch":
      return fail("This payment does not belong to that booking", 403);
    case "unconfirmable":
      return fail(UNCONFIRMABLE_ERROR, 409);
  }
}
