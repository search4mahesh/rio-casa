import { NextRequest } from "next/server";
import { z } from "zod";
import {
  priceRooms,
  previewPromo,
  resolveSelection,
  splitDiscountAcrossRooms,
} from "@/lib/booking-service";
import { dateOnly, isDayString } from "@/lib/dates";
import { ok, fail, failValidation } from "@/lib/api-response";
import { parseSelection } from "@/lib/room-capacity";

// GET /api/booking/promo/preview?code=&checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD
//        &roomId=                             — one room, or
//        &rooms=standard:2,family:1&guests=5  — a party across several
//
// What a promo code would be worth on this stay, without spending a
// redemption. Separate from /api/booking/quote on purpose — that route is
// read-only by construction because claiming a promo is a write, and a price
// preview must never spend anything. This route calls `previewPromo`, a plain
// SELECT, not the UPDATE `createGroupBooking` uses to actually claim one.
//
// Because the code can go stale between this preview and the guest hitting
// "Confirm Booking" (exhausted by someone else, expired at midnight),
// `createGroupBooking` fails the whole booking if a submitted promo code can no
// longer be claimed — it never silently drops back to full price. That is
// what keeps the total shown here honest: if it doesn't hold up, the booking
// does not go through rather than charging more than what was shown.
//
// One code is worth one discount for the whole party, not one per room, and it
// is split across the rooms by the same `splitDiscountAcrossRooms` the booking
// uses — so this total and the charged total are produced by one function.
const QuerySchema = z.object({
  code: z.string().min(1),
  checkIn: z.string().refine(isDayString, "Use YYYY-MM-DD for checkIn"),
  checkOut: z.string().refine(isDayString, "Use YYYY-MM-DD for checkOut"),
  roomId: z.string().min(1).optional(),
  rooms: z.string().min(1).optional(),
  guests: z.coerce.number().int().min(1).max(40).optional(),
  extraBed: z.enum(["true", "false"]).optional(),
});

export async function GET(req: NextRequest) {
  const parsed = QuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return failValidation(parsed.error);

  const { code, roomId, rooms: roomsParam, extraBed } = parsed.data;
  if (!roomId && !roomsParam) return fail("Pass either roomId or rooms", 400);

  const checkIn = dateOnly(parsed.data.checkIn);
  const checkOut = dateOnly(parsed.data.checkOut);
  if (checkOut <= checkIn) return fail("Check-out must be after check-in", 400);

  const guests = parsed.data.guests ?? 1;

  // The same resolution the quote and the booking do, so the discount is
  // computed against the subtotal the guest will actually be charged on.
  let requests;
  if (roomsParam) {
    const selection = parseSelection(roomsParam);
    if (!selection) return fail("Malformed rooms selection", 400);

    const resolved = await resolveSelection(checkIn, checkOut, selection, guests);
    if (!resolved) return fail("Those rooms are no longer available", 409);
    if (resolved.allocation.capacity < guests) {
      return fail("Those rooms do not sleep everyone in the party", 400);
    }
    requests = resolved.rooms;
  } else {
    requests = [{ roomId: roomId!, extraBed: extraBed === "true" }];
  }

  const pricing = await priceRooms(requests, checkIn, checkOut);
  if (!pricing) return fail("Room not found", 404);

  // Matched exactly as typed — same as `claimPromo` at booking creation, so a
  // code that previews as valid claims under the identical string later.
  const preview = await previewPromo(code.trim(), checkIn, pricing.nights, pricing.subtotal);

  if (!preview.valid) {
    return ok({ valid: false, reason: preview.reason });
  }

  const { lines, total } = splitDiscountAcrossRooms(
    pricing.lines,
    preview.discount,
    pricing.nights
  );

  const sum = (pick: (l: (typeof lines)[number]) => number) =>
    Math.round(lines.reduce((s, l) => s + pick(l), 0) * 100) / 100;

  const cgstAmount = sum((l) => l.cgstAmount);
  const sgstAmount = sum((l) => l.sgstAmount);

  return ok({
    valid: true,
    subtotal: pricing.subtotal,
    discountAmount: preview.discount,
    cgstAmount,
    sgstAmount,
    taxAmount: Math.round((cgstAmount + sgstAmount) * 100) / 100,
    totalAmount: total,
  });
}
