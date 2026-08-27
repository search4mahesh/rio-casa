import { NextRequest } from "next/server";
import { checkAvailability, getAvailableRooms } from "@/lib/booking-service";
import { ok, fail } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const checkIn = searchParams.get("checkIn");
  const checkOut = searchParams.get("checkOut");
  const roomId = searchParams.get("roomId");

  if (!checkIn || !checkOut) {
    return fail("checkIn and checkOut are required", 400);
  }

  const checkInDate = new Date(checkIn);
  const checkOutDate = new Date(checkOut);

  if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime())) {
    return fail("Invalid date format", 400);
  }
  if (checkInDate >= checkOutDate) {
    return fail("checkOut must be after checkIn", 400);
  }

  // Single-room check
  if (roomId) {
    const result = await checkAvailability(roomId, checkInDate, checkOutDate);
    return ok(result);
  }

  // Every free room for the date range — the whole catalogue, not the subset
  // that sleeps the party on its own.
  //
  // Party size shapes the *selection*, not the list. A party of five fits in
  // the family room with a rollaway, but it may equally want two standards, and
  // narrowing to rooms that individually fit hides that second option
  // completely. Narrowing all the way was worse still: no single room sleeps
  // six, so the list came back empty and the wizard told a party the resort was
  // full while five rooms stood free (B-57).
  //
  // The wizard still sends `guests`; it is simply not a filter any more, so it
  // is not read here. `lib/room-capacity.ts` composes the party from this list.
  const rooms = await getAvailableRooms(checkInDate, checkOutDate, 1);

  return ok(rooms.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      pricePerNight: r.pricePerNight,
      maxGuests: r.maxGuests,
      amenities: r.amenities,
      images: r.images,
      roomType: r.roomType,
      extraBed: r.extraBed,
      extraBedRate: Number(r.extraBedRate),
    })));
}
