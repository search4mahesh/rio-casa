import { NextRequest } from "next/server";
import { z } from "zod";
import { createOrder } from "@/lib/razorpay";
import {
  createGroupBooking,
  recalcGuestTotals,
  releasePromoClaimByCode,
  resolveSelection,
} from "@/lib/booking-service";
import { prisma } from "@/lib/prisma";
import { ok, fail, failValidation } from "@/lib/api-response";

// POST /api/booking/create
//
// Two shapes, one path. `roomId` is the single-room form the room detail page
// still posts; `rooms` is a party spread across several — `{ standard: 2,
// family: 1 }`. Both end up in `createGroupBooking`, so a family of five and a
// couple are priced, locked and committed by the same code.
//
// Extra beds are deliberately **not** in this schema. `resolveSelection` works
// out how many the headcount needs and which rooms carry them; a client that
// could say otherwise would book a party of five into four beds. Same rule as
// totals — see "No total is ever computed in the browser" in CLAUDE.md.
const schema = z.object({
  roomId: z.string().min(1).optional(),
  rooms: z.record(z.string(), z.number().int().min(0).max(20)).optional(),
  checkIn: z.string().datetime(),
  checkOut: z.string().datetime(),
  guestName: z.string().min(2),
  guestEmail: z.string().email(),
  guestPhone: z.string().min(10),
  guests: z.number().int().min(1).max(40),
  adults: z.number().int().min(1).max(40).optional(),
  children: z.number().int().min(0).max(40).optional(),
  promoCode: z.string().optional(),
  specialRequests: z.string().optional(),
}).refine((v) => v.roomId || v.rooms, {
  message: "Pass either roomId or rooms",
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return failValidation(parsed.error);
  }

  const {
    roomId, rooms: selection, checkIn, checkOut,
    guestName, guestEmail, guestPhone,
    guests, adults, children,
    promoCode, specialRequests,
  } = parsed.data;

  const checkInDate = new Date(checkIn);
  const checkOutDate = new Date(checkOut);

  // Resolve the guest's category picks into concrete rooms and extra beds. The
  // server decides both, for the same reason it decides the price.
  let roomRequests;
  if (selection) {
    const resolved = await resolveSelection(checkInDate, checkOutDate, selection, guests);
    if (!resolved) {
      return fail("Those rooms are no longer available. Please choose again.", 409);
    }
    if (resolved.allocation.capacity < guests) {
      return fail(`Those rooms sleep ${resolved.allocation.capacity}, not ${guests}. Please add a room.`, 400);
    }
    roomRequests = resolved.rooms;
  } else {
    roomRequests = [{ roomId: roomId! }];
  }

  const result = await createGroupBooking({
    rooms: roomRequests,
    checkIn: checkInDate,
    checkOut: checkOutDate,
    adults: adults ?? guests,
    children: children ?? 0,
    guestName,
    guestEmail,
    guestPhone,
    source: "website",
    promoCode,
    specialRequests,
  });

  if (!result.success || !result.group) {
    const statusCode = result.errorCode === "ROOM_NOT_AVAILABLE" ? 409
      : result.errorCode === "INVALID_DATES" ? 400
      : result.errorCode === "PROMO_INVALID" ? 400
      : 500;
    return fail(result.error ?? "Booking could not be created", statusCode);
  }

  const group = result.group;

  // The booking is already committed at this point, so a Razorpay failure must
  // not leave it standing — `confirmed` rows with no order hold every room in
  // the party on the calendar for a guest who only ever saw an error. Void the
  // lot and put the guest's lifetime stats back the way createGroupBooking
  // found them.
  let order: Awaited<ReturnType<typeof createOrder>>;
  try {
    // One order for the party. Charging per room would open Razorpay three
    // times for one reservation and leave a family half-paid if they closed
    // the modal after the second.
    order = await createOrder(Math.round(group.totalAmount * 100), group.id);
  } catch (err) {
    console.error("Razorpay order creation failed", err);

    const bookingIds = group.bookings.map((b) => b.id);
    // group is a narrowed projection and carries no guestId.
    const { guestId } = (await prisma.bookingGroup.findUnique({
      where: { id: group.id },
      select: { guestId: true },
    })) ?? { guestId: null };

    await prisma.$transaction([
      // Availability queries skip cancelled/failed bookings, so this frees the rooms.
      prisma.booking.updateMany({
        where: { id: { in: bookingIds } },
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
          entityType: "booking_group",
          entityId: group.id,
          newValue: { groupNumber: group.groupNumber, totalAmount: group.totalAmount },
        },
      }),
    ]);

    // The voided bookings must stop counting toward the guest's lifetime totals.
    if (guestId) await recalcGuestTotals(prisma, guestId);

    // The promo claim committed along with the booking that is now being
    // voided — hand it back, or a capped code loses a redemption to every
    // guest whose Razorpay order simply failed to create.
    if (promoCode) {
      await releasePromoClaimByCode(promoCode).catch((e) =>
        console.error("[booking/create] could not release promo claim:", e)
      );
    }

    return fail("We could not start the payment. No booking was made — please try again.", 502);
  }

  // Stored on the group *and* on every room. The group's copy is what
  // /api/payment/verify binds the payment to; the per-room copies keep the
  // stale-hold sweeper's Razorpay check working on any row it happens to scan.
  await prisma.$transaction([
    prisma.bookingGroup.update({
      where: { id: group.id },
      data: { razorpayOrderId: order.id },
    }),
    prisma.booking.updateMany({
      where: { id: { in: group.bookings.map((b) => b.id) } },
      data: { razorpayOrderId: order.id },
    }),
  ]);

  return ok({
      groupId: group.id,
      // The first room's id, so the existing confirmation link keeps working
      // for a party of one room.
      bookingId: group.bookings[0].id,
      bookingNumber: group.groupNumber,
      orderId: order.id,
      amount: group.totalAmount,
      discountAmount: group.discountAmount,
      cgstAmount: group.bookings.reduce((s, b) => s + b.cgstAmount, 0),
      sgstAmount: group.bookings.reduce((s, b) => s + b.sgstAmount, 0),
      nights: group.nights,
      roomName: group.bookings.length === 1
        ? group.bookings[0].room.name
        : `${group.bookings.length} rooms`,
      rooms: group.bookings.map((b) => ({
        bookingId: b.id,
        bookingNumber: b.bookingNumber,
        roomName: b.room.name,
        extraBed: b.extraBed,
        totalAmount: b.totalAmount,
      })),
    });
}
