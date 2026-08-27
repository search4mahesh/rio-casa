import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifySignature } from "@/lib/razorpay";
import {
  BOOKING_TX_OPTIONS,
  guardRoomsAvailability,
  recalcGuestTotals,
  syncWithChannelManager,
  withSerializableRetry,
} from "@/lib/booking-service";
import { today } from "@/lib/dates";
import { Resend } from "resend";
import { ok, fail } from "@/lib/api-response";

const schema = z.object({
  bookingId: z.string(),
  razorpayOrderId: z.string(),
  razorpayPaymentId: z.string(),
  razorpaySignature: z.string(),
});

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * What the guest is told when their money arrived but the booking could not be
 * confirmed. The wizard shows its own "do not pay again" copy on any non-2xx,
 * so this is what reaches logs and any other API consumer.
 */
const UNCONFIRMABLE_ERROR =
  "Your payment was received but this booking is no longer held. Do not pay again — " +
  "our team will contact you to rebook or refund you.";

/** The booking projection this route works from. */
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

/**
 * Try to give a cancelled booking its room back, now that the guest has paid.
 *
 * Goes through `guardRoomAvailability` like every other path that writes a
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
  razorpayPaymentId: string
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
    // survived every retry. All of them mean "we could not hold this room".
    console.error(
      `[payment/verify] could not reinstate ${booking.bookingNumber} after a late payment:`,
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
        newValue: { status: "confirmed", paymentStatus: "paid", razorpayPaymentId },
      },
    });
  } catch (err) {
    console.error(`[payment/verify] reinstatement bookkeeping failed for ${booking.bookingNumber}:`, err);
  }

  console.error(
    `[payment/verify] ${dead.map((b) => b.bookingNumber).join(", ")} ` +
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
  triple: { razorpayPaymentId: string; razorpayOrderId: string; razorpaySignature: string }
): Promise<void> {
  const lead = unit[0];
  const total = unit.reduce((s, b) => s + b.totalAmount, 0);
  const numbers = unit.map((b) => b.bookingNumber).join(", ");

  console.error(
    `[payment/verify] PAYMENT RECEIVED FOR A CANCELLED BOOKING — ${numbers} ` +
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
          },
        },
      }),
    ]);
  } catch (err) {
    // Nothing left to fall back on, but the console line above already carries
    // everything needed to find the payment in the Razorpay dashboard.
    console.error(`[payment/verify] could not record the orphaned payment for ${numbers}:`, err);
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return fail("Invalid payload", 400);
  }

  const { bookingId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = parsed.data;

  // The signature proves Razorpay authorised *this order and payment pair*.
  // It says nothing about which booking they belong to.
  if (!verifySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
    return fail("Payment verification failed", 400);
  }

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
  if (!existing) return fail("Booking not found", 404);

  // ── The check this route was missing ──────────────────────────────────
  // Without it the signature alone was enough to mark ANY booking paid: pay
  // ₹2,000 for the cheapest room, keep the {order, payment, signature} triple
  // the checkout handler receives, then replay it against someone else's
  // bookingId. Both halves have to belong together, and `razorpayOrderId` was
  // already stored on the row by /api/booking/create for exactly this purpose.
  if (!existing.razorpayOrderId || existing.razorpayOrderId !== razorpayOrderId) {
    console.error(
      `[payment/verify] order mismatch for ${existing.bookingNumber}: ` +
        `booking holds ${existing.razorpayOrderId ?? "no order"}, request presented ${razorpayOrderId}`
    );
    return fail("This payment does not belong to that booking", 403);
  }

  // Replaying a triple against its own booking is harmless but must not write a
  // second payment row — that would double-count the stay in every revenue
  // report. Answer as if we had just confirmed it.
  if (existing.razorpayPaymentId === razorpayPaymentId) {
    if (existing.paymentStatus === "paid") {
      return ok({ bookingId: existing.id, bookingNumber: existing.bookingNumber });
    }
    // Already recorded against a booking we could not confirm — the payment row
    // and the alert below exist, so answer the same way without writing again.
    return fail(UNCONFIRMABLE_ERROR, 409);
  }

  // ── The other half of the binding: is this booking still live? ────────
  //
  // `verifySignature` and the order check above both pass for a booking the
  // hold sweeper already cancelled — the order genuinely does belong to it.
  // The guest left the Razorpay modal open past BOOKING_HOLD_MINUTES,
  // `expireStalePaymentHolds()` asked Razorpay, was told "unpaid" (true at
  // that instant), voided the booking and released the room; then the guest
  // paid. Marking that booking paid charged them for a stay that no longer
  // existed and emailed them "Booking Confirmed!" while the confirmation page
  // told them the opposite (B-38).
  //
  // The money is real, so refusing outright is not enough either. Try to give
  // the room back first — that is almost always possible, because a hold
  // expiring does not mean anyone else took the room in the seconds since.
  // ── The party, not just the room the wizard happened to name ──────────
  //
  // One Razorpay order covers every room a party booked, so this one payment
  // settles all of them. Confirming only `bookingId` would leave the other
  // rooms `pending`, and the hold sweeper would then cancel rooms the guest has
  // already paid for.
  const unit: BookingRow[] = existing.groupId
    ? await prisma.booking.findMany({
        where: { groupId: existing.groupId },
        select: {
          id: true, bookingNumber: true, status: true, paymentStatus: true,
          guestId: true, groupId: true, roomId: true, checkIn: true,
          checkOut: true, totalAmount: true,
        },
        orderBy: { bookingNumber: "asc" },
      })
    : [existing];

  if (unit.some((b) => b.status === "cancelled" || b.status === "no_show")) {
    const reinstated = await reinstateCancelledBookings(unit, razorpayPaymentId);
    if (!reinstated) {
      // The room really is gone (or the stay is already in the past). Record
      // the payment so it is visible in the booking's Payment History and can
      // be refunded, and say so plainly rather than confirming anything.
      await recordUnmatchedPayment(unit, {
        razorpayPaymentId,
        razorpayOrderId,
        razorpaySignature,
      });
      return fail(UNCONFIRMABLE_ERROR, 409);
    }
  }

  // Mark every room in the party paid, and record one payment row per room for
  // what that room cost — the parts sum to what Razorpay took, and no single
  // room is credited with the whole party's money in a revenue report.
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
        },
      },
    }),
  ]);

  // Re-read for the confirmation email, which needs the room and guest fields.
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { room: true },
  });
  const partyRooms = existing.groupId
    ? await prisma.booking.findMany({
        where: { groupId: existing.groupId },
        select: { bookingNumber: true, extraBed: true, room: { select: { name: true } } },
        orderBy: { bookingNumber: "asc" },
      })
    : [{ bookingNumber: booking.bookingNumber, extraBed: booking.extraBed, room: { name: booking.room.name } }];

  // Channel manager sync (fire-and-forget), one per room.
  for (const b of unit) syncWithChannelManager(b.id).catch(console.error);

  // Booking confirmation email
  if (process.env.RESEND_API_KEY) {
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

    // Non-fatal. The payment is already recorded, so a Resend outage must not
    // turn a confirmed booking into a 500 — the wizard reads that as "we could
    // not confirm the booking" and tells a guest who has just paid to contact
    // support about a stay that is, in fact, confirmed.
    //
    // The SDK resolves `{ data, error }` for an API-level failure (bad key,
    // rejected recipient, …) rather than throwing — only a network failure
    // throws, which is all a trailing `.catch()` here used to catch (B-37).
    try {
      const { error: sendError } = await resend.emails.send({
        from: process.env.EMAIL_FROM ?? "bookings@riocasa.in",
        to: booking.guestEmail,
        subject: `Booking Confirmed — ${partyRooms.length > 1 ? booking.bookingNumber.split("/")[0] : booking.bookingNumber} | Rio Casa`,
        html: `
          <div style="font-family:Georgia,serif;max-width:600px;margin:auto;padding:24px;color:#2C2416;">
            <h1 style="color:#4A6741;font-size:26px;margin-bottom:4px;">Booking Confirmed!</h1>
            <p style="color:#6b7280;font-size:13px;margin-top:0;">${partyRooms.length > 1 ? booking.bookingNumber.split("/")[0] : booking.bookingNumber}</p>
            <p>Dear ${booking.guestName},</p>
            <p>Your stay at <strong>Rio Casa, Mahabaleshwar</strong> is confirmed. We look forward to welcoming you!</p>
            <hr style="border-color:#e5e7eb;margin:20px 0;" />
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              <tr><td style="padding:6px 0;color:#6b7280;">${partyRooms.length > 1 ? "Rooms" : "Room"}</td><td style="padding:6px 0;font-weight:bold;">${roomsLine}</td></tr>
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
            ${booking.specialRequests ? `<p style="font-size:13px;"><strong>Special Requests:</strong> ${booking.specialRequests}</p>` : ""}
            <p style="font-size:13px;color:#6b7280;">
              For any queries, call us at +91 98765 43210 or email info@riocasa.in<br/>
              Rio Casa Resort, Mahabaleshwar, Satara District, Maharashtra — 412806
            </p>
          </div>
        `,
      });
      if (sendError) {
        console.error(`[payment/verify] confirmation email failed for ${booking.bookingNumber}:`, sendError);
      }
    } catch (err) {
      console.error(`[payment/verify] confirmation email failed for ${booking.bookingNumber}:`, err);
    }
  }

  return ok({ bookingId: booking.id, bookingNumber: booking.bookingNumber });
}
