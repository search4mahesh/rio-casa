import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { quoteStay, applyGst } from "@/lib/booking-service";
import { dateOnly, isDayString } from "@/lib/dates";
import { ok, fail, failValidation } from "@/lib/api-response";

// GET /api/booking/quote?roomId=&checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD&extraBed=
//
// What the stay actually costs, priced through the same `quoteStay` → `applyGst`
// pair every booking path uses.
//
// It exists because the wizard was quoting `pricePerNight × nights` client-side
// and calling that the total. The server adds GST at 12% or 18% and the rate
// plan's weekend markup on top, so the guest agreed to one number on the
// summary screen and Razorpay opened for another — roughly 18% higher on a
// weekend. The correct figure was only available as a side effect of creating
// the booking, which is far too late to show anyone.
//
// Read-only by construction: a promo code is deliberately not accepted here,
// because claiming one is a write (`claimPromo` consumes a redemption) and a
// price preview must never spend anything. The wizard does not collect promo
// codes today; adding them means a separate non-consuming preview.
const QuerySchema = z.object({
  roomId: z.string().min(1),
  checkIn: z.string().refine(isDayString, "Use YYYY-MM-DD for checkIn"),
  checkOut: z.string().refine(isDayString, "Use YYYY-MM-DD for checkOut"),
  extraBed: z.enum(["true", "false"]).optional(),
});

export async function GET(req: NextRequest) {
  const parsed = QuerySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams)
  );
  if (!parsed.success) return failValidation(parsed.error);

  const { roomId, extraBed } = parsed.data;
  const checkIn = dateOnly(parsed.data.checkIn);
  const checkOut = dateOnly(parsed.data.checkOut);

  if (checkOut <= checkIn) return fail("Check-out must be after check-in", 400);

  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { id: true, name: true, roomType: true, pricePerNight: true, isActive: true },
  });
  if (!room || !room.isActive) return fail("Room not found", 404);

  const quote = await quoteStay({
    room,
    checkIn,
    checkOut,
    extraBed: extraBed === "true",
  });

  // No discount: see the note above about promo claims being writes.
  const totals = applyGst(quote.subtotal, 0, quote.nights);

  return ok({
    roomId: room.id,
    roomName: room.name,
    nights: quote.nights,
    nightlyRate: quote.nightlyRate,
    extraBedRate: quote.extraBedRate,
    // Weekend markup and extra bed included; the difference from
    // nightlyRate × nights is what the rate plan added.
    subtotal: quote.subtotal,
    cgstAmount: totals.cgstAmount,
    sgstAmount: totals.sgstAmount,
    taxAmount: totals.cgstAmount + totals.sgstAmount,
    totalAmount: totals.totalAmount,
  });
}
