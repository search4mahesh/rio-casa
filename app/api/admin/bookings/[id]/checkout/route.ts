import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { okMessage, fail } from "@/lib/api-response";
import { generateInvoice } from "@/lib/invoice-service";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(req, "frontdesk");
  if (!auth.ok) return auth.response;
  const staff = auth.staff;

  const booking = await prisma.booking.findUnique({ where: { id: params.id } });
  if (!booking) {
    return fail("Booking not found", 404);
  }
  if (booking.status !== "checked_in") {
    return fail(`Cannot check out a booking with status: ${booking.status}`, 400);
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

  // Bookkeeping, not check-out — the room is already vacant and the guest
  // already gone regardless of whether this succeeds. A stay that was never
  // actually paid for (still "pending", or a no-show that got checked out by
  // mistake) gets no tax invoice; "paid"/"cash" mirrors how reconciliation
  // already defines revenue that counts.
  if (booking.paymentStatus === "paid" || booking.paymentStatus === "cash") {
    try {
      await generateInvoice(booking.id);
    } catch (err) {
      console.error(`[checkout] invoice generation failed for ${booking.bookingNumber}:`, err);
    }
  }

  return okMessage(`${booking.guestName} checked out`);
}
