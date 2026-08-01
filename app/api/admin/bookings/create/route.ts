import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { ok, fail, failValidation } from "@/lib/api-response";
import {
  applyGst,
  BOOKING_TX_OPTIONS,
  guardRoomAvailability,
  nextBookingNumber,
  quoteStay,
  recalcGuestTotals,
  resolveGuest,
  withSerializableRetry,
} from "@/lib/booking-service";

const WalkInSchema = z.object({
  roomId: z.string(),
  checkIn: z.string(),
  checkOut: z.string(),
  guestName: z.string().min(2),
  guestEmail: z.string().email().optional().or(z.literal("")),
  guestPhone: z.string().min(10),
  adults: z.number().int().min(1).default(1),
  children: z.number().int().min(0).default(0),
  extraBed: z.boolean().default(false),
  paymentMethod: z.enum(["cash", "upi", "card", "complimentary"]).default("cash"),
  amountPaid: z.number().min(0).default(0),
  specialRequests: z.string().optional(),
  // A negotiated nightly rate. The front desk settles on a number with the
  // guest standing there; without this the route could only ever charge the
  // tariff, which is why it grew its own cut-down pricing in the first place.
  // Recorded in the audit log so a manager can see who discounted what.
  nightlyRate: z.number().positive().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, "frontdesk");
  if (!auth.ok) return auth.response;
  const staff = auth.staff;

  const body = await req.json().catch(() => null);
  const parsed = WalkInSchema.safeParse(body);
  if (!parsed.success) return failValidation(parsed.error);
  const data = parsed.data;

  const checkIn = new Date(data.checkIn);
  const checkOut = new Date(data.checkOut);

  if (checkOut <= checkIn) return fail("Check-out must be after check-in");

  try {
    const room = await prisma.room.findUnique({ where: { id: data.roomId } });
    if (!room) return fail("Room not found", 404);

    // Same pricing the website uses — rate plan, weekend markup, extra bed —
    // unless the desk negotiated a rate, which replaces all three.
    const quote = await quoteStay({
      room,
      checkIn,
      checkOut,
      extraBed: data.extraBed,
      rateOverride: data.nightlyRate ?? null,
    });
    const nights = quote.nights;
    const { cgstAmount: cgst, sgstAmount: sgst, totalAmount: total } = applyGst(
      quote.subtotal,
      0, // promo codes are a website thing; the desk negotiates the rate instead
      nights
    );

    // Two staff creating a booking at the same moment used to read the same
    // count and generate the same number; the second insert died on the unique
    // index and the front desk saw "Server error". Allocation is atomic now,
    // and shared with the website flow so the two cannot collide either.
    const bookingNumber = await nextBookingNumber(checkIn);

    const booking = await withSerializableRetry(() => prisma.$transaction(
      async (tx) => {
        // A walk-in is a guest like any other. This route used to insert the
        // booking with no `guestId` at all, so every walk-in was invisible to
        // the guest directory and never counted toward a returning guest's
        // stays or revenue. Runs before the lock — it needs the transaction's
        // isolation, not the room.
        const guestId = await resolveGuest(tx, {
          guestName: data.guestName,
          guestEmail: data.guestEmail || "",
          guestPhone: data.guestPhone,
        });

        // ══ Critical section ══════════════════════════════════════════
        // The front desk used to race the website: this route checked for
        // conflicts with no lock and no blocked-date test, leaving only the
        // Layer 1 exclusion constraint, which reached staff as "Server error".
        await guardRoomAvailability(tx, data.roomId, checkIn, checkOut);

        const created = await tx.booking.create({
          data: {
            bookingNumber,
            guestId,
            roomId: data.roomId,
            guestName: data.guestName,
            guestEmail: data.guestEmail || "",
            guestPhone: data.guestPhone,
            checkIn,
            checkOut,
            nights,
            adults: data.adults,
            children: data.children,
            extraBed: data.extraBed,
            totalAmount: total,
            cgstAmount: cgst,
            sgstAmount: sgst,
            status: "confirmed",
            paymentStatus: data.amountPaid >= total ? "cash" : "pending",
            source: "walkin",
            specialRequests: data.specialRequests,
          },
        });

        // Money stays in the transaction even though it lengthens the critical
        // section: cash taken at the desk must not survive as a booking with no
        // payment row against it.
        if (data.amountPaid > 0) {
          await tx.payment.create({
            data: {
              bookingId: created.id,
              amount: data.amountPaid,
              paymentMethod: data.paymentMethod,
              paymentType: "full_payment",
              status: "completed",
              receivedBy: staff.name,
            },
          });
        }

        return { ...created, guestId };
        // ══ Critical section ends — lock released on commit ═══════════
      },
      BOOKING_TX_OPTIONS
    ));

    // Bookkeeping, after the lock is released. Non-fatal: a booking the front
    // desk has already taken cash for must not be lost to an audit write.
    try {
      await recalcGuestTotals(prisma, booking.guestId);
      await prisma.auditLog.create({
        data: {
          userId: staff.staffId,
          action: "create_walkin_booking",
          entityType: "booking",
          entityId: booking.id,
          newValue: {
            bookingNumber,
            by: staff.name,
            nightlyRate: quote.nightlyRate,
            totalAmount: total,
            // A negotiated rate is the one thing here a manager may need to
            // question later, so it is recorded explicitly rather than implied
            // by the total.
            rateOverridden: quote.overridden,
          },
        },
      });
    } catch (err) {
      console.error(`[admin/bookings/create] bookkeeping failed for ${bookingNumber}:`, err);
    }

    return ok(booking);
  } catch (err) {
    const error = err as Error & { conflictingBooking?: string };

    if (error.message === "ROOM_NOT_AVAILABLE") {
      return fail(
        `Room is not available from ${data.checkIn} to ${data.checkOut}` +
          (error.conflictingBooking ? ` — held by ${error.conflictingBooking}` : ""),
        409
      );
    }
    if (error.message === "BLOCKED_DATE") {
      return fail("Those dates are blocked for this room. Unblock them first.", 409);
    }

    console.error("[admin/bookings/create] failed:", error);
    return fail("Server error", 500);
  }
}
