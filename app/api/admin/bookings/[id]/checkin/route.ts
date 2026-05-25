import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAdminToken, ADMIN_COOKIE } from "@/lib/admin-auth";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  const staff = token ? await verifyAdminToken(token) : null;
  if (!staff) return NextResponse.json({ success: false }, { status: 401 });

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

  return NextResponse.json({ success: true, message: `${booking.guestName} checked in` });
}
