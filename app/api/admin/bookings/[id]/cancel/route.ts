import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { okMessage } from "@/lib/api-response";
import { recalcGuestTotals } from "@/lib/booking-service";

const CancelSchema = z.object({
  reason: z.string().optional(),
  refundAmount: z.number().min(0).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(req, "manager");
  if (!auth.ok) return auth.response;
  const staff = auth.staff;

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
      // Free the room if it was holding this booking. Gating on `checked_in`
      // missed the common case: a confirmed booking flagged due_checkin leaves
      // the room pointing at a cancelled booking forever.
      prisma.roomStatus.updateMany({
        where: { currentBookingId: booking.id },
        data: {
          occupancy: "vacant",
          ...(booking.status === "checked_in" ? { housekeeping: "dirty" } : {}),
          currentBookingId: null,
          currentGuestId: null,
        },
      }),
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

    // A cancelled booking is no longer a stay, so the guest's lifetime totals
    // have to come back down.
    await recalcGuestTotals(prisma, booking.guestId);

    return okMessage(`Booking ${booking.bookingNumber} cancelled`);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
