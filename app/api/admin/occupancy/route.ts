import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { ok } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "frontdesk");
  if (!auth.ok) return auth.response;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(today.getTime() + 14 * 86400000);

  const [rooms, bookings] = await Promise.all([
    prisma.room.findMany({
      where: { isActive: true },
      orderBy: [{ floor: "asc" }, { roomNumber: "asc" }],
      select: { id: true, name: true, roomNumber: true, roomType: true, floor: true },
    }),
    prisma.booking.findMany({
      where: {
        checkIn: { lt: rangeEnd },
        checkOut: { gt: today },
        status: { notIn: ["cancelled", "no_show"] },
      },
      select: {
        id: true,
        bookingNumber: true,
        guestName: true,
        roomId: true,
        checkIn: true,
        checkOut: true,
        nights: true,
        status: true,
        adults: true,
      },
    }),
  ]);

  return ok({ rooms, bookings });
}
