import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createOrder } from "@/lib/razorpay";
import { createBooking, recalcGuestTotals } from "@/lib/booking-service";
import { ok, fail, failValidation } from "@/lib/api-response";

const schema = z.object({
  roomId: z.string().min(1),
  checkIn: z.string().datetime(),
  checkOut: z.string().datetime(),
  guestName: z.string().min(2),
  guestEmail: z.string().email(),
  guestPhone: z.string().min(10),
  guests: z.number().int().min(1).max(10),
  adults: z.number().int().min(1).max(10).optional(),
  children: z.number().int().min(0).max(10).optional(),
  extraBed: z.boolean().optional(),
  promoCode: z.string().optional(),
  specialRequests: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return failValidation(parsed.error);
  }

  const {
    roomId, checkIn, checkOut,
    guestName, guestEmail, guestPhone,
    guests, adults, children, extraBed,
    promoCode, specialRequests,
  } = parsed.data;

  const result = await createBooking({
    roomId,
    checkIn: new Date(checkIn),
    checkOut: new Date(checkOut),
    adults: adults ?? guests,
    children: children ?? 0,
    extraBed: extraBed ?? false,
    guestName,
    guestEmail,
    guestPhone,
    source: "website",
    promoCode,
    specialRequests,
  });

  if (!result.success || !result.booking) {
    const statusCode = result.errorCode === "ROOM_NOT_AVAILABLE" ? 409
      : result.errorCode === "INVALID_DATES" ? 400
      : 500;
    return fail(result.error ?? "Booking could not be created", statusCode);
  }

  const { prisma } = await import("@/lib/prisma");

  // The booking is already committed at this point, so a Razorpay failure must
  // not leave it standing — a `confirmed` row with no order holds the room on
  // the calendar for a guest who only ever saw an error. Void it and put the
  // guest's lifetime stats back the way createBooking found them.
  let order: Awaited<ReturnType<typeof createOrder>>;
  try {
    order = await createOrder(
      Math.round(result.booking.totalAmount * 100),
      result.booking.id
    );
  } catch (err) {
    console.error("Razorpay order creation failed", err);

    const { id: bookingId, totalAmount, bookingNumber } = result.booking;
    // result.booking is a narrowed projection and carries no guestId.
    const { guestId } = (await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { guestId: true },
    })) ?? { guestId: null };

    await prisma.$transaction([
      // Availability queries skip cancelled/failed bookings, so this frees the room.
      prisma.booking.update({
        where: { id: bookingId },
        data: {
          status: "cancelled",
          paymentStatus: "failed",
          cancelledAt: new Date(),
          cancellationReason: "Payment could not be initiated",
        },
      }),
      prisma.auditLog.create({
        data: {
          userId: "system",
          action: "booking_voided_payment_init_failed",
          entityType: "booking",
          entityId: bookingId,
          newValue: { bookingNumber, totalAmount },
        },
      }),
    ]);

    // The voided booking must stop counting toward the guest's lifetime totals.
    await recalcGuestTotals(prisma, guestId);

    return fail("We could not start the payment. No booking was made — please try again.", 502);
  }

  // Store the Razorpay order ID on the booking
  await prisma.booking.update({
    where: { id: result.booking.id },
    data: { razorpayOrderId: order.id },
  });

  return ok({
      bookingId: result.booking.id,
      bookingNumber: result.booking.bookingNumber,
      orderId: order.id,
      amount: result.booking.totalAmount,
      cgstAmount: result.booking.cgstAmount,
      sgstAmount: result.booking.sgstAmount,
      nights: result.booking.nights,
      roomName: result.booking.room.name,
    });
}
