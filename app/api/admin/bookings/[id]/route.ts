import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAdminToken, ADMIN_COOKIE } from "@/lib/admin-auth";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  const staff = token ? await verifyAdminToken(token) : null;
  if (!staff) return NextResponse.json({ success: false }, { status: 401 });

  const booking = await prisma.booking.findUnique({
    where: { id: params.id },
    include: {
      room: true,
      guest: true,
      payments: { orderBy: { createdAt: "desc" } },
      invoices: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!booking) {
    return NextResponse.json({ success: false, error: "Booking not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, booking });
}
