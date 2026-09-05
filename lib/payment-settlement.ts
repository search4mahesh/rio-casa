// ─────────────────────────────────────────────
// PAYMENT SETTLEMENT
//
// The single path from "Razorpay has the money" to "the booking is paid".
//
// There are two ways that news reaches us and they must not become two
// implementations — the same mistake the two pricing paths and the two counter
// allocators made before:
//
//   1. `/api/payment/verify` — the guest's browser, after the checkout modal
//      closes. Fast, and carries the {order, payment, signature} triple.
//   2. `/api/payment/webhook` — Razorpay, server to server. Slower, but it
//      arrives whether or not the guest's browser ever came back.
//
// Everything below the signature check is common to both, so it lives here and
// each route does only what is genuinely its own: authenticating the caller and
// choosing an HTTP status.
// ─────────────────────────────────────────────

import { prisma } from "@/lib/prisma";
import {
  BOOKING_TX_OPTIONS,
  guardRoomsAvailability,
  recalcGuestTotals,
  withSerializableRetry,
} from "@/lib/booking-service";
import { syncWithChannelManager } from "@/lib/channel-manager";
import { today } from "@/lib/dates";
import { Resend } from "resend";
import { escapeHtml, escapeHtmlWithBreaks } from "@/lib/html-email";
import { PROPERTY } from "@/lib/property";

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * What the guest is told when their money arrived but the booking could not be
 * confirmed. The wizard shows its own "do not pay again" copy on any non-2xx,
 * so this is what reaches logs and any other API consumer.
 */
export const UNCONFIRMABLE_ERROR =
  "Your payment was received but this booking is no longer held. Do not pay again — " +
  "our team will contact you to rebook or refund you.";

/**
 * Which caller is settling. Only ever used for log prefixes and the audit
 * row — the decisions below are identical either way, deliberately.
 */
export type SettlementSource = "checkout" | "webhook";

/**
 * The outcome of a settlement attempt, as a decision rather than an HTTP
 * status: the browser and Razorpay want very different responses to the same
 * facts. `unconfirmable` is a 409 to the guest and a 200 to Razorpay, because
 * the money has been recorded for refund and redelivering will not change that.
 */
export type SettlementResult =
  | { status: "confirmed"; bookingId: string; bookingNumber: string }
  | { status: "already_settled"; bookingId: string; bookingNumber: string }
  | { status: "not_found" }
  | { status: "order_mismatch"; bookingNumber: string }
  | { status: "unconfirmable"; bookingNumber: string };

/** The booking projection settlement works from. */
type BookingRow = {
  id: string;
  bookingNumber: string;
  status: string;
  paymentStatus: string;
  guestId: string | null;
  groupId: string | null;
  roomId: string;
  checkIn: Date;
  checkOut: Date;
  totalAmount: number;
};

const UNIT_SELECT = {
  id: true, bookingNumber: true, status: true, paymentStatus: true,
  guestId: true, groupId: true, roomId: true, checkIn: true,
  checkOut: true, totalAmount: true,
} as const;

/** A Prisma unique-constraint violation — here, always the payments index. */
function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === "P2002";
}

/**
 * The booking an order belongs to, for callers that know only the order.
 *
 * The webhook never sees a booking id: Razorpay's payload names the order it
 * captured. `razorpayOrderId` is written onto the booking by
 * `/api/booking/create` and is the same column `/api/payment/verify` binds
 * against, so both routes resolve a payment to a booking the same way.
 *
 * For a party this returns the lead room; settlement widens to the whole group
 * by itself.
 */
export async function findBookingIdByOrder(razorpayOrderId: string): Promise<string | null> {
  const match = await prisma.booking.findFirst({
    where: { razorpayOrderId },
    // The lead room of a party, matching the booking id the wizard names.
    orderBy: { bookingNumber: "asc" },
    select: { id: true },
  });
  return match?.id ?? null;
}

/**
 * Whether these rooms are already live again *against this same payment*.
 *
 * The payment id is the part that matters: a manager reinstating the booking by
 * hand for unrelated reasons must not be mistaken for this payment having been
 * settled, or the money would go unrecorded.
 */
async function alreadyReinstatedBy(dead: BookingRow[], razorpayPaymentId: string): Promise<boolean> {
  try {
    const live = await prisma.booking.count({
      where: {
        id: { in: dead.map((b) => b.id) },
        status: "confirmed",
        razorpayPaymentId,
      },
    });
    return live === dead.length;
  } catch {
    // Cannot tell — fall back on the safe answer, which is to record the money
    // for refund rather than assume a stay was confirmed.
    return false;
  }
}

/**
 * Try to give a cancelled booking its room back, now that the guest has paid.
 *
 * Goes through `guardRoomsAvailability` like every other path that writes a
 * booking (see "Keep the critical section short" in CLAUDE.md): re-occupying a
 * room is a booking decision, so it takes the same `FOR UPDATE` and the same
 * conflict/blocked-date re-check. Reinstating with `paymentStatus: "paid"`
 * inside the transaction also puts the row back under the
 * `no_overlapping_bookings` exclusion constraint at commit, so Layer 1 still
 * backstops it.
 *
 * Returns false — never throws — when the room has genuinely gone to someone
 * else, the dates have since been blocked, or the stay is already in the past.
 * The caller then records the payment for refund instead.
 */
async function reinstateCancelledBookings(
  unit: BookingRow[],
  razorpayPaymentId: string,
  source: SettlementSource
): Promise<boolean> {
  const dead = unit.filter((b) => b.status === "cancelled" || b.status === "no_show");
  if (dead.length === 0) return true;

  const booking = unit[0];
  // A stay that has already started cannot be handed back. This is the
  // no-show case, and a late payment against it is a refund, not a check-in.
  if (booking.checkIn < today()) return false;

  try {
    const restored = await withSerializableRetry(() =>
      prisma.$transaction(async (tx) => {
        // All of the party's rooms, in one ordered pass. A party is reinstated
        // whole or not at all: handing back two rooms of three leaves a family
        // holding a booking they cannot sleep in, against a payment for all
        // three.
        await guardRoomsAvailability(
          tx,
          dead.map((b) => b.roomId),
          booking.checkIn,
          booking.checkOut
        );

        // Compare-and-swap on the statuses we read, so a manager cancelling or
        // a second request reinstating in the meantime loses cleanly. A short
        // count throws, which rolls back every room in the party.
        let restoredCount = 0;
        for (const b of dead) {
          const { count } = await tx.booking.updateMany({
            where: { id: b.id, status: b.status },
            data: {
              status: "confirmed",
              paymentStatus: "paid",
              razorpayPaymentId,
              cancelledAt: null,
              cancellationReason: null,
            },
          });
          restoredCount += count;
        }
        if (restoredCount !== dead.length) throw new Error("REINSTATE_RACE");
        return true;
      }, BOOKING_TX_OPTIONS)
    );
    if (!restored) return false;
  } catch (err) {
    // ROOM_NOT_AVAILABLE, BLOCKED_DATE, or a serialization failure that
    // survived every retry. All of them mean "we could not hold this room" —
    // except one, which now has two callers and so can happen for a benign
    // reason: the *other* settlement path reinstated these rooms a moment ago.
    // Losing that race is a success, not a refund, so it is checked before the
    // payment is written off.
    if (await alreadyReinstatedBy(dead, razorpayPaymentId)) {
      console.error(
        `[payment/${source}] ${booking.bookingNumber} was reinstated by the other ` +
          `settlement path while this one was trying — treating as settled`
      );
      return true;
    }
    console.error(
      `[payment/${source}] could not reinstate ${booking.bookingNumber} after a late payment:`,
      (err as Error).message
    );
    return false;
  }

  // Bookkeeping, after the lock is released and deliberately non-fatal — the
  // booking is live again either way. The sweeper decremented these when it
  // cancelled, so they have to come back up.
  try {
    await recalcGuestTotals(prisma, booking.guestId);
    await prisma.auditLog.create({
      data: {
        userId: "system",
        action: "booking_reinstated_after_late_payment",
        entityType: booking.groupId ? "booking_group" : "booking",
        entityId: booking.groupId ?? booking.id,
        oldValue: { bookingNumbers: dead.map((b) => b.bookingNumber), statuses: dead.map((b) => b.status) },
        newValue: { status: "confirmed", paymentStatus: "paid", razorpayPaymentId, source },
      },
    });
  } catch (err) {
    console.error(`[payment/${source}] reinstatement bookkeeping failed for ${booking.bookingNumber}:`, err);
  }

  console.error(
    `[payment/${source}] ${dead.map((b) => b.bookingNumber).join(", ")} ` +
      `${dead.length > 1 ? "were" : "was"} cancelled as an expired hold but the guest then paid — ` +
      `the ${dead.length > 1 ? "rooms were" : "room was"} still free, so it has been reinstated and confirmed`
  );
  return true;
}

/**
 * Record money that arrived for a booking we cannot confirm.
 *
 * The booking stays `cancelled`, so it keeps out of availability and out of
 * every revenue report — this stay is not income, it is a refund waiting to
 * happen. The `Payment` row is what makes the money visible at all: it shows
 * up in Payment History on the booking page, which is where staff will look.
 *
 * `razorpayPaymentId` goes onto the booking too, so a retry of the same triple
 * is recognised as a replay and does not write a second payment row.
 */
async function recordUnmatchedPayment(
  unit: BookingRow[],
  triple: { razorpayPaymentId: string; razorpayOrderId: string; razorpaySignature: string | null },
  source: SettlementSource
): Promise<void> {
  const lead = unit[0];
  const total = unit.reduce((s, b) => s + b.totalAmount, 0);
  const numbers = unit.map((b) => b.bookingNumber).join(", ");

  console.error(
    `[payment/${source}] PAYMENT RECEIVED FOR A CANCELLED BOOKING — ${numbers} ` +
      `(₹${total}, razorpay payment ${triple.razorpayPaymentId}). ` +
      `The ${unit.length > 1 ? "rooms" : "room"} could not be recovered. ` +
      `This guest must be refunded or rebooked.`
  );

  try {
    await prisma.$transaction([
      // One row per room, each for what that room cost, so the parts still sum
      // to what Razorpay took and no single room is credited with the party's
      // whole payment.
      ...unit.map((b) =>
        prisma.payment.create({
          data: {
            bookingId: b.id,
            amount: b.totalAmount,
            paymentMethod: "razorpay",
            paymentType: "full",
            razorpayPaymentId: triple.razorpayPaymentId,
            razorpayOrderId: triple.razorpayOrderId,
            razorpaySignature: triple.razorpaySignature,
            // The money did change hands — what is unresolved is the booking,
            // not the payment.
            status: "completed",
            notes:
              "Received after the booking was cancelled as an expired payment hold. " +
              "The room could not be reinstated — refund or rebook this guest.",
          },
        })
      ),
      prisma.booking.updateMany({
        where: { id: { in: unit.map((b) => b.id) } },
        data: { razorpayPaymentId: triple.razorpayPaymentId },
      }),
      prisma.auditLog.create({
        data: {
          userId: "system",
          action: "payment_received_for_cancelled_booking",
          entityType: lead.groupId ? "booking_group" : "booking",
          entityId: lead.groupId ?? lead.id,
          newValue: {
            bookingNumbers: unit.map((b) => b.bookingNumber),
            amount: total,
            razorpayPaymentId: triple.razorpayPaymentId,
            needsRefund: true,
            source,
          },
        },
      }),
    ]);
  } catch (err) {
    // The other settlement path got there first; its rows say the same thing.
    if (isUniqueViolation(err)) return;
    // Nothing left to fall back on, but the console line above already carries
    // everything needed to find the payment in the Razorpay dashboard.
    console.error(`[payment/${source}] could not record the orphaned payment for ${numbers}:`, err);
  }
}

/**
 * Settle a payment against its booking.
 *
 * The caller has already established that Razorpay authorised this money — by
 * the checkout signature or by the webhook signature. What is decided here is
 * the part that signature does not answer: which booking it belongs to, whether
 * that booking is still live, and what to do when it is not.
 *
 * Safe to call twice for the same payment, from either route or both. That is
 * not incidental — with a webhook in play, concurrent settlement of one payment
 * is the normal case rather than an edge, and double-counting a stay would
 * corrupt every revenue report. Three things hold it shut:
 *
 * - The replay check below, which answers a sequential retry without writing.
 * - A unique index on `payments (razorpay_payment_id, booking_id)`, which makes
 *   a second row unrepresentable rather than merely unlikely. A concurrent
 *   settlement fails on it and is reported as `already_settled`.
 * - `alreadyReinstatedBy`, for the narrower race inside reinstatement.
 */
export async function settlePayment(input: {
  bookingId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  /** Absent for a webhook: its signature covers the delivery, not the pair. */
  razorpaySignature: string | null;
  source: SettlementSource;
}): Promise<SettlementResult> {
  const { bookingId, razorpayOrderId, razorpayPaymentId, razorpaySignature, source } = input;

  const existing = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      bookingNumber: true,
      razorpayOrderId: true,
      razorpayPaymentId: true,
      paymentStatus: true,
      // `status` is what tells a live booking from one the hold sweeper (or a
      // manager) has already cancelled. Selecting only `paymentStatus` is how
      // a guest could be charged for a stay that no longer existed (B-38).
      status: true,
      guestId: true,
      groupId: true,
      roomId: true,
      checkIn: true,
      checkOut: true,
      totalAmount: true,
    },
  });
  if (!existing) return { status: "not_found" };

  // ── The binding between the money and the booking ─────────────────────
  // Without it the signature alone was enough to mark ANY booking paid: pay
  // ₹2,000 for the cheapest room, keep the {order, payment, signature} triple
  // the checkout handler receives, then replay it against someone else's
  // bookingId (B-01). Both halves have to belong together, and `razorpayOrderId`
  // was already stored on the row by /api/booking/create for exactly this.
  //
  // The webhook reaches this having *looked the booking up by* the order id, so
  // it cannot fail here — which is the point. One binding, checked once,
  // whichever way the news arrived.
  if (!existing.razorpayOrderId || existing.razorpayOrderId !== razorpayOrderId) {
    console.error(
      `[payment/${source}] order mismatch for ${existing.bookingNumber}: ` +
        `booking holds ${existing.razorpayOrderId ?? "no order"}, request presented ${razorpayOrderId}`
    );
    return { status: "order_mismatch", bookingNumber: existing.bookingNumber };
  }

  // Replaying against its own booking is harmless but must not write a second
  // payment row — that would double-count the stay in every revenue report.
  // Answer as if we had just confirmed it.
  if (existing.razorpayPaymentId === razorpayPaymentId) {
    if (existing.paymentStatus === "paid") {
      return { status: "already_settled", bookingId: existing.id, bookingNumber: existing.bookingNumber };
    }
    // Already recorded against a booking we could not confirm — the payment row
    // and the alert exist, so answer the same way without writing again.
    return { status: "unconfirmable", bookingNumber: existing.bookingNumber };
  }

  // ── The other half of the binding: is this booking still live? ────────
  //
  // The signature and the order check both pass for a booking the hold sweeper
  // already cancelled — the order genuinely does belong to it. The guest left
  // the Razorpay modal open past BOOKING_HOLD_MINUTES,
  // `expireStalePaymentHolds()` asked Razorpay, was told "unpaid" (true at that
  // instant), voided the booking and released the room; then the guest paid.
  // Marking that booking paid charged them for a stay that no longer existed
  // and emailed them "Booking Confirmed!" while the confirmation page told them
  // the opposite (B-38).
  //
  // The money is real, so refusing outright is not enough either. Try to give
  // the room back first — that is almost always possible, because a hold
  // expiring does not mean anyone else took the room in the seconds since.
  //
  // ── The party, not just the room the wizard happened to name ──────────
  //
  // One Razorpay order covers every room a party booked, so this one payment
  // settles all of them. Confirming only `bookingId` would leave the other
  // rooms `pending`, and the hold sweeper would then cancel rooms the guest has
  // already paid for.
  const unit: BookingRow[] = existing.groupId
    ? await prisma.booking.findMany({
        where: { groupId: existing.groupId },
        select: UNIT_SELECT,
        orderBy: { bookingNumber: "asc" },
      })
    : [existing];

  if (unit.some((b) => b.status === "cancelled" || b.status === "no_show")) {
    const reinstated = await reinstateCancelledBookings(unit, razorpayPaymentId, source);
    if (!reinstated) {
      // The room really is gone (or the stay is already in the past). Record
      // the payment so it is visible in the booking's Payment History and can
      // be refunded, and say so plainly rather than confirming anything.
      await recordUnmatchedPayment(
        unit,
        { razorpayPaymentId, razorpayOrderId, razorpaySignature },
        source
      );
      return { status: "unconfirmable", bookingNumber: existing.bookingNumber };
    }
  }

  // Mark every room in the party paid, and record one payment row per room for
  // what that room cost — the parts sum to what Razorpay took, and no single
  // room is credited with the whole party's money in a revenue report.
  try {
    await prisma.$transaction([
      prisma.booking.updateMany({
        where: { id: { in: unit.map((b) => b.id) } },
        data: { paymentStatus: "paid", razorpayPaymentId },
      }),
      ...unit.map((b) =>
        prisma.payment.create({
          data: {
            bookingId: b.id,
            amount: b.totalAmount,
            paymentMethod: "razorpay",
            paymentType: "full",
            razorpayPaymentId,
            razorpayOrderId,
            razorpaySignature,
            status: "completed",
          },
        })
      ),
      ...(existing.groupId
        ? [prisma.bookingGroup.update({
            where: { id: existing.groupId },
            data: { razorpayPaymentId },
          })]
        : []),
      prisma.auditLog.create({
        data: {
          userId: "system",
          action: "payment_received",
          entityType: existing.groupId ? "booking_group" : "booking",
          entityId: existing.groupId ?? existing.id,
          newValue: {
            paymentStatus: "paid",
            razorpayPaymentId,
            totalAmount: unit.reduce((s, b) => s + b.totalAmount, 0),
            bookingNumbers: unit.map((b) => b.bookingNumber),
            source,
          },
        },
      }),
    ]);
  } catch (err) {
    // The unique index on payments. The other settlement path committed these
    // exact rows while this one was in flight, so the booking is paid and the
    // money is recorded once — which is the outcome this path wanted. The whole
    // transaction rolled back, so there is nothing to undo.
    if (isUniqueViolation(err)) {
      return { status: "already_settled", bookingId: existing.id, bookingNumber: existing.bookingNumber };
    }
    throw err;
  }

  // Channel manager sync (fire-and-forget), one per room.
  for (const b of unit) syncWithChannelManager(b.id).catch(console.error);

  await sendConfirmationEmail(bookingId, existing.groupId, unit, source);

  return { status: "confirmed", bookingId: existing.id, bookingNumber: existing.bookingNumber };
}

/**
 * The guest's "Booking Confirmed!" mail.
 *
 * Deliberately non-fatal and deliberately last: the payment is already
 * recorded, so a Resend outage must not turn a confirmed booking into a 500 —
 * the wizard reads that as "we could not confirm the booking" and tells a guest
 * who has just paid to contact support about a stay that is, in fact,
 * confirmed (B-17).
 */
async function sendConfirmationEmail(
  bookingId: string,
  groupId: string | null,
  unit: BookingRow[],
  source: SettlementSource
): Promise<void> {
  if (!process.env.RESEND_API_KEY) return;

  try {
    // Re-read for the confirmation email, which needs the room and guest fields.
    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: { room: true },
    });
    const partyRooms = groupId
      ? await prisma.booking.findMany({
          where: { groupId },
          select: { bookingNumber: true, extraBed: true, room: { select: { name: true } } },
          orderBy: { bookingNumber: "asc" },
        })
      : [{ bookingNumber: booking.bookingNumber, extraBed: booking.extraBed, room: { name: booking.room.name } }];

    // Totals across the party, not the one room the wizard named — the guest
    // paid once, for all of it.
    const partyTotal = unit.reduce((sum, b) => sum + b.totalAmount, 0);
    const partyTax = (await prisma.booking.aggregate({
      where: { id: { in: unit.map((b) => b.id) } },
      _sum: { cgstAmount: true, sgstAmount: true },
    }))._sum;
    const taxTotal = (partyTax.cgstAmount ?? 0) + (partyTax.sgstAmount ?? 0);

    const gstLine = taxTotal > 0
      ? `<tr><td style="padding:4px 0;color:#6b7280;">CGST + SGST</td><td style="padding:4px 0;">₹${taxTotal.toLocaleString("en-IN")}</td></tr>`
      : "";

    // "Family Room (+ extra bed), Standard Room" — a party must be able to see
    // it got everything it booked.
    const roomsLine = partyRooms
      .map((r) => `${r.room.name}${r.extraBed ? " (+ extra bed)" : ""}`)
      .join("<br/>");

    const reference = partyRooms.length > 1
      ? booking.bookingNumber.split("/")[0]
      : booking.bookingNumber;

    // The SDK resolves `{ data, error }` for an API-level failure (bad key,
    // rejected recipient, …) rather than throwing — only a network failure
    // throws, which is all a trailing `.catch()` here used to catch (B-37).
    const { error: sendError } = await resend.emails.send({
      from: process.env.EMAIL_FROM ?? PROPERTY.bookingsEmail,
      to: booking.guestEmail,
      subject: `Booking Confirmed — ${reference} | ${PROPERTY.name}`,
      html: `
          <div style="font-family:Georgia,serif;max-width:600px;margin:auto;padding:24px;color:#2C2416;">
            <h1 style="color:#4A6741;font-size:26px;margin-bottom:4px;">Booking Confirmed!</h1>
            <p style="color:#6b7280;font-size:13px;margin-top:0;">${reference}</p>
            <p>Dear ${escapeHtml(booking.guestName)},</p>
            <p>Your stay at <strong>${PROPERTY.name}, ${PROPERTY.city}</strong> is confirmed. We look forward to welcoming you!</p>
            <hr style="border-color:#e5e7eb;margin:20px 0;" />
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              <tr><td style="padding:6px 0;color:#6b7280;">${partyRooms.length > 1 ? "Rooms" : "Room"}</td><td style="padding:6px 0;font-weight:bold;">${escapeHtml(roomsLine)}</td></tr>
              <tr><td style="padding:6px 0;color:#6b7280;">Check-in</td><td style="padding:6px 0;">${new Date(booking.checkIn).toDateString()}</td></tr>
              <tr><td style="padding:6px 0;color:#6b7280;">Check-out</td><td style="padding:6px 0;">${new Date(booking.checkOut).toDateString()}</td></tr>
              <tr><td style="padding:6px 0;color:#6b7280;">Nights</td><td style="padding:6px 0;">${booking.nights}</td></tr>
              <tr><td style="padding:6px 0;color:#6b7280;">Guests</td><td style="padding:6px 0;">${booking.adults}${booking.children > 0 ? ` adults + ${booking.children} children` : ""}</td></tr>
              ${gstLine}
              <tr style="border-top:1px solid #e5e7eb;">
                <td style="padding:8px 0;font-weight:bold;color:#4A6741;">Total Paid</td>
                <td style="padding:8px 0;font-weight:bold;color:#4A6741;font-size:16px;">₹${partyTotal.toLocaleString("en-IN")}</td>
              </tr>
            </table>
            <hr style="border-color:#e5e7eb;margin:20px 0;" />
            ${booking.specialRequests ? `<p style="font-size:13px;"><strong>Special Requests:</strong> ${escapeHtmlWithBreaks(booking.specialRequests)}</p>` : ""}
            <p style="font-size:13px;color:#6b7280;">
              For any queries, call us at ${PROPERTY.phone} or email ${PROPERTY.email}<br/>
              ${PROPERTY.billingName}, ${PROPERTY.address}
            </p>
          </div>
        `,
    });
    if (sendError) {
      console.error(`[payment/${source}] confirmation email failed for ${booking.bookingNumber}:`, sendError);
    }
  } catch (err) {
    console.error(`[payment/${source}] confirmation email failed for booking ${bookingId}:`, err);
  }
}
