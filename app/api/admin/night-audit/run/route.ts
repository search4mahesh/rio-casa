import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { ok } from "@/lib/api-response";
import { today as todayDate, addDays } from "@/lib/dates";
import { releaseRoomsHolding, recalcGuestTotals } from "@/lib/booking-service";

// POST /api/admin/night-audit/run — execute the night audit
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, "manager");
  if (!auth.ok) return auth.response;
  const staff = auth.staff;

  // Calendar days against DATE columns — see lib/dates.ts. A day's drift here
  // no-shows the wrong arrivals.
  const today = todayDate();
  const tomorrow = addDays(today, 1);

  // 1. Mark missed arrivals as no_show (confirmed bookings with checkIn < today)
  const missed = await prisma.booking.findMany({
    where: { checkIn: { lt: today }, status: "confirmed" },
    select: { id: true, guestId: true },
  });
  const noShows = await prisma.booking.updateMany({
    where: { id: { in: missed.map((b) => b.id) } },
    data: { status: "no_show" },
  });
  // A no-show is not a stay, so the guest's totals have to come back down.
  for (const guestId of new Set(missed.map((b) => b.guestId))) {
    await recalcGuestTotals(prisma, guestId);
  }

  // Release the rooms those bookings were holding. Without this the room board
  // keeps showing the no-show's name and check-out date forever, and the room
  // stays stuck on due_checkin — rooms 201/202 sat that way for two months.
  await releaseRoomsHolding(missed.map((b) => b.id));

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

  return ok({
      noShowsMarked: noShows.count,
      arrivalsFlagged: todayArrivals.length,
      departuresFlagged: dueDepartures.length,
    });
}
