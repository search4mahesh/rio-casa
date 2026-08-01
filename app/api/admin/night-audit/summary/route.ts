import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { ok } from "@/lib/api-response";
import { today as todayDate, addDays } from "@/lib/dates";

// GET /api/admin/night-audit/summary — today's operational snapshot
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "manager");
  if (!auth.ok) return auth.response;

  // Calendar days against DATE columns — see lib/dates.ts.
  const today = todayDate();
  const tomorrow = addDays(today, 1);
  const yesterday = addDays(today, -1);

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

  return ok({
      date: today.toISOString(),
      arrivals: serializeDates(arrivals),
      departures: serializeDates(departures),
      noShows: serializeDates(noShows),
      inHouse: serializeDates(inHouse),
      todayRevenue: Number(revenue._sum.totalAmount ?? 0),
    });
}
