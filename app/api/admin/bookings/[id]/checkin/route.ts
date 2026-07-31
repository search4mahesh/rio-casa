import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { okMessage } from "@/lib/api-response";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(req, "frontdesk");
  if (!auth.ok) return auth.response;
  const staff = auth.staff;

  const booking = await prisma.booking.findUnique({
    where: { id: params.id },
    include: { guest: true },
  });

  if (!booking) {
    return NextResponse.json({ success: false, error: "Booking not found" }, { status: 404 });
  }
  if (booking.status !== "confirmed") {
    return NextResponse.json(
      { success: false, error: `Cannot check in a booking with status: ${booking.status}` },
      { status: 400 }
    );
  }

  await prisma.$transaction([
    prisma.booking.update({
      where: { id: params.id },
      data: { status: "checked_in", actualCheckin: new Date() },
    }),
    prisma.roomStatus.upsert({
      where: { roomId: booking.roomId },
      create: {
        roomId: booking.roomId,
        occupancy: "occupied",
        housekeeping: "clean",
        currentBookingId: booking.id,
        currentGuestId: booking.guestId ?? null,
      },
      update: {
        occupancy: "occupied",
        currentBookingId: booking.id,
        currentGuestId: booking.guestId ?? null,
      },
    }),
    prisma.auditLog.create({
      data: {
        userId: staff.staffId,
        action: "check_in",
        entityType: "booking",
        entityId: booking.id,
        newValue: { status: "checked_in", by: staff.name },
      },
    }),
  ]);

  return okMessage(`${booking.guestName} checked in`);
}
