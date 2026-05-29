import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAdminToken, ADMIN_COOKIE } from "@/lib/admin-auth";

// POST /api/admin/night-audit/run — execute the night audit
export async function POST(req: NextRequest) {
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  const staff = token ? await verifyAdminToken(token) : null;
  if (!staff) return NextResponse.json({ success: false }, { status: 401 });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // 1. Mark missed arrivals as no_show (confirmed bookings with checkIn < today)
  const noShows = await prisma.booking.updateMany({
    where: { checkIn: { lt: today }, status: "confirmed" },
    data: { status: "no_show" },
  });

  // 2. Flag today's confirmed arrivals on room status as due_checkin
  const todayArrivals = await prisma.booking.findMany({
    where: { checkIn: { gte: today, lt: tomorrow }, status: "confirmed" },
    select: { id: true, roomId: true },
  });

  for (const booking of todayArrivals) {
    await prisma.roomStatus.upsert({
      where: { roomId: booking.roomId },
      create: { roomId: booking.roomId, occupancy: "due_checkin", currentBookingId: booking.id },
      update: { occupancy: "due_checkin", currentBookingId: booking.id },
    });
  }

  // 3. Flag checked-in guests whose checkout is today as due_checkout
  const dueDepartures = await prisma.booking.findMany({
    where: { checkOut: { gte: today, lt: tomorrow }, status: "checked_in" },
    select: { id: true, roomId: true },
  });

  for (const booking of dueDepartures) {
    await prisma.roomStatus.upsert({
      where: { roomId: booking.roomId },
      create: { roomId: booking.roomId, occupancy: "due_checkout", currentBookingId: booking.id },
      update: { occupancy: "due_checkout" },
    });
  }

  await prisma.auditLog.create({
    data: {
      userId: staff.staffId,
      action: "night_audit_run",
      entityType: "system",
      entityId: "night_audit",
      newValue: {
        noShowsMarked: noShows.count,
        arrivalsFlaged: todayArrivals.length,
        departuresFlagged: dueDepartures.length,
        runAt: new Date().toISOString(),
        runBy: staff.name,
      },
    },
  });

  return NextResponse.json({
    success: true,
    result: {
      noShowsMarked: noShows.count,
      arrivalsFlagged: todayArrivals.length,
      departuresFlagged: dueDepartures.length,
    },
  });
}
