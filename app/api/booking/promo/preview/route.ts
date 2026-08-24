import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { quoteStay, applyGst, previewPromo } from "@/lib/booking-service";
import { dateOnly } from "@/lib/dates";
import { ok, fail, failValidation } from "@/lib/api-response";

// GET /api/booking/promo/preview?code=&roomId=&checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD&extraBed=
//
// What a promo code would be worth on this stay, without spending a
// redemption. Separate from /api/booking/quote on purpose — that route is
// read-only by construction because claiming a promo is a write, and a price
// preview must never spend anything. This route calls `previewPromo`, a plain
// SELECT, not the UPDATE `createBooking` uses to actually claim one.
//
// Because the code can go stale between this preview and the guest hitting
// "Confirm Booking" (exhausted by someone else, expired at midnight),
// `createBooking` fails the whole booking if a submitted promo code can no
// longer be claimed — it never silently drops back to full price. That is
// what keeps the total shown here honest: if it doesn't hold up, the booking
// does not go through rather than charging more than what was shown.
const QuerySchema = z.object({
  code: z.string().min(1),
  roomId: z.string().min(1),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD for checkIn"),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD for checkOut"),
  extraBed: z.enum(["true", "false"]).optional(),
});

export async function GET(req: NextRequest) {
  const parsed = QuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return failValidation(parsed.error);

  const { code, roomId, extraBed } = parsed.data;
  const checkIn = dateOnly(parsed.data.checkIn);
  const checkOut = dateOnly(parsed.data.checkOut);

  if (checkOut <= checkIn) return fail("Check-out must be after check-in", 400);

  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { id: true, name: true, roomType: true, pricePerNight: true, isActive: true },
  });
  if (!room || !room.isActive) return fail("Room not found", 404);

  const quote = await quoteStay({ room, checkIn, checkOut, extraBed: extraBed === "true" });
  // Matched exactly as typed — same as `claimPromo` at booking creation, so a
  // code that previews as valid claims under the identical string later.
  const preview = await previewPromo(code.trim(), checkIn, quote.nights, quote.subtotal);

  if (!preview.valid) {
    return ok({ valid: false, reason: preview.reason });
  }

  const totals = applyGst(quote.subtotal, preview.discount, quote.nights);

  return ok({
    valid: true,
    subtotal: quote.subtotal,
    discountAmount: preview.discount,
    cgstAmount: totals.cgstAmount,
    sgstAmount: totals.sgstAmount,
    taxAmount: totals.cgstAmount + totals.sgstAmount,
    totalAmount: totals.totalAmount,
  });
}
