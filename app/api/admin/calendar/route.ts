import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAdminToken, ADMIN_COOKIE } from "@/lib/admin-auth";
import { hasMinRole, forbidden } from "@/lib/rbac";

// GET /api/admin/calendar?month=YYYY-MM
export async function GET(req: NextRequest) {
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  const staff = token ? await verifyAdminToken(token) : null;
  if (!staff) return NextResponse.json({ success: false }, { status: 401 });
  if (!hasMinRole(staff.role, "frontdesk")) return forbidden("frontdesk");

  const { searchParams } = req.nextUrl;
  const rawMonth = searchParams.get("month") ?? new Date().toISOString().slice(0, 7);

  const parts = rawMonth.split("-");
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);

  if (!year || !month || month < 1 || month > 12 || isNaN(year)) {
    return NextResponse.json({ success: false, error: "Use YYYY-MM format" }, { status: 400 });
  }

  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);
  const daysInMonth = new Date(year, month, 0).getDate();

  const [rooms, bookings, blockedDates] = await Promise.all([
    prisma.room.findMany({
      where: { isActive: true },
      select: { id: true, name: true, roomNumber: true, roomType: true, floor: true },
      orderBy: [{ floor: "asc" }, { roomNumber: "asc" }],
    }),
    prisma.booking.findMany({
      where: {
        checkIn: { lt: monthEnd },
        checkOut: { gt: monthStart },
        status: { notIn: ["cancelled"] },
      },
      select: {
        id: true, bookingNumber: true, guestName: true, roomId: true,
        checkIn: true, checkOut: true, nights: true, status: true, adults: true,
        totalAmount: true,
      },
      orderBy: { checkIn: "asc" },
    }),
    prisma.blockedDate.findMany({
      where: { blockDate: { gte: monthStart, lt: monthEnd } },
      select: { id: true, roomId: true, blockDate: true, reason: true },
    }),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      rooms,
      bookings: bookings.map((b) => ({
        ...b,
        checkIn: b.checkIn.toISOString(),
        checkOut: b.checkOut.toISOString(),
      })),
      blockedDates: blockedDates.map((bd) => ({
        ...bd,
        blockDate: bd.blockDate.toISOString(),
      })),
      daysInMonth,
      monthStart: monthStart.toISOString(),
    },
  });
}
