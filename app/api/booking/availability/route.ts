import { NextRequest, NextResponse } from "next/server";
import { checkAvailability, getAvailableRooms } from "@/lib/booking-service";
import { ok } from "@/lib/api-response";
import { positiveIntParam } from "@/lib/query-params";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const checkIn = searchParams.get("checkIn");
  const checkOut = searchParams.get("checkOut");
  const roomId = searchParams.get("roomId");
  // `parseInt("abc")` is NaN, which reached `maxGuests: { gte: NaN }` and died
  // as an empty 500 — a blank body the wizard cannot parse (B-41).
  const guests = positiveIntParam(searchParams.get("guests"), 1, 20);

  if (!checkIn || !checkOut) {
    return NextResponse.json(
      { success: false, error: "checkIn and checkOut are required" },
      { status: 400 }
    );
  }

  const checkInDate = new Date(checkIn);
  const checkOutDate = new Date(checkOut);

  if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime())) {
    return NextResponse.json({ success: false, error: "Invalid date format" }, { status: 400 });
  }
  if (checkInDate >= checkOutDate) {
    return NextResponse.json(
      { success: false, error: "checkOut must be after checkIn" },
      { status: 400 }
    );
  }

  // Single-room check
  if (roomId) {
    const result = await checkAvailability(roomId, checkInDate, checkOutDate);
    return ok(result);
  }

  // All available rooms for the date range
  const rooms = await getAvailableRooms(checkInDate, checkOutDate, guests);
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
    })));
}
