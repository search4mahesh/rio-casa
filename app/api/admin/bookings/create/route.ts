import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyAdminToken, ADMIN_COOKIE } from "@/lib/admin-auth";
import { hasMinRole, forbidden } from "@/lib/rbac";

const WalkInSchema = z.object({
  roomId: z.string(),
  checkIn: z.string(),
  checkOut: z.string(),
  guestName: z.string().min(2),
  guestEmail: z.string().email().optional().or(z.literal("")),
  guestPhone: z.string().min(10),
  adults: z.number().int().min(1).default(1),
  children: z.number().int().min(0).default(0),
  extraBed: z.boolean().default(false),
  paymentMethod: z.enum(["cash", "upi", "card", "complimentary"]).default("cash"),
  amountPaid: z.number().min(0).default(0),
  specialRequests: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  const staff = token ? await verifyAdminToken(token) : null;
  if (!staff) return NextResponse.json({ success: false }, { status: 401 });
  if (!hasMinRole(staff.role, "frontdesk")) return forbidden("frontdesk");

  try {
    const body = await req.json();
    const data = WalkInSchema.parse(body);

    const checkIn = new Date(data.checkIn);
    const checkOut = new Date(data.checkOut);
    const nights = Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

    if (nights < 1) {
      return NextResponse.json({ success: false, error: "Check-out must be after check-in" }, { status: 400 });
    }

    const room = await prisma.room.findUnique({ where: { id: data.roomId } });
    if (!room) return NextResponse.json({ success: false, error: "Room not found" }, { status: 404 });

    // Check for overlapping bookings
    const conflict = await prisma.booking.findFirst({
      where: {
        roomId: data.roomId,
        status: { notIn: ["cancelled", "no_show"] },
        checkIn: { lt: checkOut },
        checkOut: { gt: checkIn },
      },
    });
    if (conflict) {
      return NextResponse.json(
        { success: false, error: `Room is not available from ${data.checkIn} to ${data.checkOut}` },
        { status: 409 }
      );
    }

    const base = Number(room.baseRate) || room.pricePerNight;
    const avgNightly = base;
    const gstRate = avgNightly <= 7500 ? 6 : 9;
    const subtotal = base * nights;
    const cgst = subtotal * (gstRate / 100);
    const sgst = subtotal * (gstRate / 100);
    const total = subtotal + cgst + sgst;

    // Generate booking number
    const today = new Date();
    const yyyymmdd = today.toISOString().slice(0, 10).replace(/-/g, "");
    const count = await prisma.booking.count({
      where: { createdAt: { gte: new Date(today.getFullYear(), today.getMonth(), today.getDate()) } },
    });
    const bookingNumber = `BK-${yyyymmdd}-${String(count + 1).padStart(3, "0")}`;

    const booking = await prisma.booking.create({
      data: {
        bookingNumber,
        roomId: data.roomId,
        guestName: data.guestName,
        guestEmail: data.guestEmail || "",
        guestPhone: data.guestPhone,
        checkIn,
        checkOut,
        nights,
        adults: data.adults,
        children: data.children,
        extraBed: data.extraBed,
        totalAmount: total,
        cgstAmount: cgst,
        sgstAmount: sgst,
        status: "confirmed",
        paymentStatus: data.amountPaid >= total ? "cash" : "pending",
        source: "walkin",
        specialRequests: data.specialRequests,
      },
    });

    if (data.amountPaid > 0) {
      await prisma.payment.create({
        data: {
          bookingId: booking.id,
          amount: data.amountPaid,
          paymentMethod: data.paymentMethod,
          paymentType: "full_payment",
          status: "completed",
          receivedBy: staff.name,
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        userId: staff.staffId,
        action: "create_walkin_booking",
        entityType: "booking",
        entityId: booking.id,
        newValue: { bookingNumber, by: staff.name },
      },
    });

    return NextResponse.json({ success: true, booking });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
