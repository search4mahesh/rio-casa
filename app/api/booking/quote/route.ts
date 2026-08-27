import { NextRequest } from "next/server";
import { z } from "zod";
import { priceRooms, applyGst, resolveSelection } from "@/lib/booking-service";
import { dateOnly, isDayString } from "@/lib/dates";
import { ok, fail, failValidation } from "@/lib/api-response";
import { parseSelection } from "@/lib/room-capacity";

// GET /api/booking/quote?checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD
//        &roomId=                        — one room, or
//        &rooms=standard:2,family:1&guests=5   — a party across several
//
// What the stay actually costs, priced through the same `priceRooms` →
// `applyGst` pair every booking path uses.
//
// It exists because the wizard was quoting `pricePerNight × nights` client-side
// and calling that the total. The server adds GST at 12% or 18% and the rate
// plan's weekend markup on top, so the guest agreed to one number on the
// summary screen and Razorpay opened for another — roughly 18% higher on a
// weekend. The correct figure was only available as a side effect of creating
// the booking, which is far too late to show anyone.
//
// A party across several rooms widens that surface rather than narrowing it:
// the guest is agreeing to a *set* of rooms and a count of extra beds, and the
// browser must not be the thing that decides either. `resolveSelection` picks
// the rooms and assigns the beds here, exactly as `createGroupBooking` will.
//
// Read-only by construction: a promo code is deliberately not accepted here,
// because claiming one is a write (`claimPromo` consumes a redemption) and a
// price preview must never spend anything. /api/booking/promo/preview is the
// non-consuming path for that.
const QuerySchema = z.object({
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

  const { roomId, rooms: roomsParam, extraBed } = parsed.data;
  if (!roomId && !roomsParam) return fail("Pass either roomId or rooms", 400);

  const checkIn = dateOnly(parsed.data.checkIn);
  const checkOut = dateOnly(parsed.data.checkOut);
  if (checkOut <= checkIn) return fail("Check-out must be after check-in", 400);

  // ── Which rooms, and which of them carry an extra bed ────────────────
  let requests;
  let capacity: number | null = null;
  const guests = parsed.data.guests ?? 1;

  if (roomsParam) {
    const selection = parseSelection(roomsParam);
    if (!selection) return fail("Malformed rooms selection", 400);

    const resolved = await resolveSelection(checkIn, checkOut, selection, guests);
    if (!resolved) return fail("Those rooms are no longer available", 409);

    // A selection that does not sleep the party is a client bug, not a price.
    // Quoting it anyway is how a party of five would reach checkout with four
    // beds booked.
    if (resolved.allocation.capacity < guests) {
      return fail("Those rooms do not sleep everyone in the party", 400);
    }
    requests = resolved.rooms;
    capacity = resolved.allocation.capacity;
  } else {
    requests = [{ roomId: roomId!, extraBed: extraBed === "true" }];
  }

  const pricing = await priceRooms(requests, checkIn, checkOut);
  if (!pricing) return fail("Room not found", 404);

  // No discount: see the note above about promo claims being writes. GST is
  // applied per room, because the slab follows each room's nightly rate.
  const priced = pricing.lines.map((line) => ({
    line,
    totals: applyGst(line.subtotal, 0, line.nights),
  }));

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const sum = (pick: (t: (typeof priced)[number]) => number) =>
    round2(priced.reduce((s, p) => s + pick(p), 0));

  const cgstAmount = sum((p) => p.totals.cgstAmount);
  const sgstAmount = sum((p) => p.totals.sgstAmount);

  // One line per room type, which is how the guest chose them — a party sees
  // "2 × Standard Room", never room 101 and room 102.
  //
  // Rooms and beds are split apart here rather than in the browser. A guest
  // shown "₹7,500 per night" and a total of "₹20,060" cannot check the second
  // against the first, and multiplying the nightly rate client-side to bridge
  // them is exactly what B-02 was: a rate plan's weekend markup means
  // `pricePerNight × nights` is not the subtotal. So the itemisation is server
  // arithmetic too, and the wizard only renders it.
  const byType = new Map<string, {
    roomType: string; roomName: string; rooms: number; extraBeds: number;
    /** The rooms alone, markup included, beds excluded. */
    roomsSubtotal: number;
    /** The rollaways alone — `extraBedRate × nights`, never marked up. */
    bedsSubtotal: number;
    subtotal: number; totalAmount: number;
  }>();
  for (const p of priced) {
    const key = p.line.room.roomType;
    const entry = byType.get(key) ?? {
      roomType: key, roomName: p.line.room.name, rooms: 0, extraBeds: 0,
      roomsSubtotal: 0, bedsSubtotal: 0, subtotal: 0, totalAmount: 0,
    };
    const beds = round2(p.line.quote.extraBedRate * p.line.nights);
    entry.rooms += 1;
    if (p.line.req.extraBed) entry.extraBeds += 1;
    entry.bedsSubtotal = round2(entry.bedsSubtotal + beds);
    entry.roomsSubtotal = round2(entry.roomsSubtotal + (p.line.subtotal - beds));
    entry.subtotal = round2(entry.subtotal + p.line.subtotal);
    entry.totalAmount = round2(entry.totalAmount + p.totals.totalAmount);
    byType.set(key, entry);
  }

  const single = priced.length === 1 ? priced[0] : null;

  return ok({
    nights: pricing.nights,
    guests,
    capacity,
    totalRooms: priced.length,
    extraBeds: priced.filter((p) => p.line.req.extraBed).length,
    lines: [...byType.values()],

    // Weekend markup and extra beds included; the difference from
    // nightlyRate × nights is what the rate plan added.
    subtotal: pricing.subtotal,
    cgstAmount,
    sgstAmount,
    taxAmount: Math.round((cgstAmount + sgstAmount) * 100) / 100,
    totalAmount: sum((p) => p.totals.totalAmount),

    // Single-room callers (the room detail page, the promo preview) read these.
    ...(single
      ? {
          roomId: single.line.room.id,
          roomName: single.line.room.name,
          // Straight off the quote, not derived from the subtotal — a rate plan
          // sets the nightly rate and a weekend markup moves the subtotal, so
          // dividing one by the other reports neither.
          nightlyRate: single.line.quote.nightlyRate,
          extraBedRate: single.line.quote.extraBedRate,
        }
      : {}),
  });
}
