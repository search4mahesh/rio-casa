import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAdminToken, ADMIN_COOKIE } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  const staff = token ? await verifyAdminToken(token) : null;
  if (!staff) return NextResponse.json({ success: false }, { status: 401 });

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

  return NextResponse.json({ success: true, rooms, bookings });
}
