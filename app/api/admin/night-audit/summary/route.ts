import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAdminToken, ADMIN_COOKIE } from "@/lib/admin-auth";
import { hasMinRole, forbidden } from "@/lib/rbac";

// GET /api/admin/night-audit/summary — today's operational snapshot
export async function GET(req: NextRequest) {
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  const staff = token ? await verifyAdminToken(token) : null;
  if (!staff) return NextResponse.json({ success: false }, { status: 401 });
  if (!hasMinRole(staff.role, "manager")) return forbidden("manager");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const bookingSelect = {
    id: true, bookingNumber: true, guestName: true, guestPhone: true,
    checkIn: true, checkOut: true, nights: true, totalAmount: true,
    status: true, paymentStatus: true,
    room: { select: { name: true, roomNumber: true, roomType: true } },
  };

  const [arrivals, departures, noShows, inHouse, revenue] = await Promise.all([
    prisma.booking.findMany({
      where: { checkIn: { gte: today, lt: tomorrow }, status: "confirmed" },
      select: bookingSelect,
      orderBy: { checkIn: "asc" },
    }),
    prisma.booking.findMany({
      where: { checkOut: { gte: today, lt: tomorrow }, status: "checked_in" },
      select: bookingSelect,
      orderBy: { checkOut: "asc" },
    }),
    prisma.booking.findMany({
      where: { checkIn: { gte: yesterday, lt: today }, status: "confirmed" },
      select: bookingSelect,
      orderBy: { checkIn: "asc" },
    }),
    prisma.booking.findMany({
      where: { status: "checked_in" },
      select: bookingSelect,
      orderBy: { checkOut: "asc" },
    }),
    prisma.booking.aggregate({
      where: { checkIn: { gte: today, lt: tomorrow }, paymentStatus: "paid" },
      _sum: { totalAmount: true },
    }),
  ]);

  function serializeDates<T extends { checkIn: Date; checkOut: Date }>(list: T[]) {
    return list.map((b) => ({ ...b, checkIn: b.checkIn.toISOString(), checkOut: b.checkOut.toISOString() }));
  }

  return NextResponse.json({
    success: true,
    summary: {
      date: today.toISOString(),
      arrivals: serializeDates(arrivals),
      departures: serializeDates(departures),
      noShows: serializeDates(noShows),
      inHouse: serializeDates(inHouse),
      todayRevenue: Number(revenue._sum.totalAmount ?? 0),
    },
  });
}
