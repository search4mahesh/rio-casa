import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyAdminToken, ADMIN_COOKIE } from "@/lib/admin-auth";

const CancelSchema = z.object({
  reason: z.string().optional(),
  refundAmount: z.number().min(0).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  const staff = token ? await verifyAdminToken(token) : null;
  if (!staff) return NextResponse.json({ success: false }, { status: 401 });

  const booking = await prisma.booking.findUnique({ where: { id: params.id } });
  if (!booking) {
    return NextResponse.json({ success: false, error: "Booking not found" }, { status: 404 });
  }
  if (["cancelled", "checked_out", "no_show"].includes(booking.status)) {
    return NextResponse.json(
      { success: false, error: `Cannot cancel a booking with status: ${booking.status}` },
      { status: 400 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { reason, refundAmount } = CancelSchema.parse(body);

    await prisma.$transaction([
      prisma.booking.update({
        where: { id: params.id },
        data: {
          status: "cancelled",
          cancelledAt: new Date(),
          cancellationReason: reason,
          refundAmount: refundAmount,
        },
      }),
      // Free the room if it was occupied by this booking
      ...(booking.status === "checked_in"
        ? [
            prisma.roomStatus.upsert({
              where: { roomId: booking.roomId },
              create: { roomId: booking.roomId, occupancy: "vacant", housekeeping: "dirty" },
              update: { occupancy: "vacant", currentBookingId: null, currentGuestId: null },
            }),
          ]
        : []),
      prisma.auditLog.create({
        data: {
          userId: staff.staffId,
          action: "cancel_booking",
          entityType: "booking",
          entityId: booking.id,
          newValue: { reason, refundAmount, by: staff.name },
        },
      }),
    ]);

    return NextResponse.json({ success: true, message: `Booking ${booking.bookingNumber} cancelled` });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
