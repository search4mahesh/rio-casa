import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createOrder } from "@/lib/razorpay";
import { createBooking } from "@/lib/booking-service";

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
    return NextResponse.json({ success: false, error: parsed.error.flatten() }, { status: 400 });
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
    return NextResponse.json({ success: false, error: result.error }, { status: statusCode });
  }

  // Create Razorpay order
  const order = await createOrder(
    Math.round(result.booking.totalAmount * 100),
    result.booking.id
  );

  // Store the Razorpay order ID on the booking
  const { prisma } = await import("@/lib/prisma");
  await prisma.booking.update({
    where: { id: result.booking.id },
    data: { razorpayOrderId: order.id },
  });

  return NextResponse.json({
    success: true,
    data: {
      bookingId: result.booking.id,
      bookingNumber: result.booking.bookingNumber,
      orderId: order.id,
      amount: result.booking.totalAmount,
      cgstAmount: result.booking.cgstAmount,
      sgstAmount: result.booking.sgstAmount,
      nights: result.booking.nights,
      roomName: result.booking.room.name,
    },
  });
}
