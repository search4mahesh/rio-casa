import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAdminToken, ADMIN_COOKIE } from "@/lib/admin-auth";
import { hasMinRole, forbidden } from "@/lib/rbac";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  const staff = token ? await verifyAdminToken(token) : null;
  if (!staff) return NextResponse.json({ success: false }, { status: 401 });
  if (!hasMinRole(staff.role, "frontdesk")) return forbidden("frontdesk");

  const booking = await prisma.booking.findUnique({ where: { id: params.id } });
  if (!booking) {
    return NextResponse.json({ success: false, error: "Booking not found" }, { status: 404 });
  }
  if (booking.status !== "checked_in") {
    return NextResponse.json(
      { success: false, error: `Cannot check out a booking with status: ${booking.status}` },
      { status: 400 }
    );
  }

  await prisma.$transaction([
    prisma.booking.update({
      where: { id: params.id },
      data: { status: "checked_out", actualCheckout: new Date() },
    }),
    prisma.roomStatus.upsert({
      where: { roomId: booking.roomId },
      create: {
        roomId: booking.roomId,
        occupancy: "vacant",
        housekeeping: "dirty",
        currentBookingId: null,
        currentGuestId: null,
      },
      update: {
        occupancy: "vacant",
        housekeeping: "dirty",
        currentBookingId: null,
        currentGuestId: null,
      },
    }),
    // Auto-create housekeeping task
    prisma.housekeepingLog.create({
      data: {
        roomId: booking.roomId,
        taskType: "checkout_clean",
        status: "pending",
        notes: `Post checkout clean — ${booking.guestName} (${booking.bookingNumber})`,
      },
    }),
    prisma.auditLog.create({
      data: {
        userId: staff.staffId,
        action: "check_out",
        entityType: "booking",
        entityId: booking.id,
        newValue: { status: "checked_out", by: staff.name },
      },
    }),
  ]);

  return NextResponse.json({ success: true, message: `${booking.guestName} checked out` });
}
