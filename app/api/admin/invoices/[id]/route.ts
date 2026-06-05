import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAdminToken, ADMIN_COOKIE } from "@/lib/admin-auth";
import { hasMinRole, forbidden } from "@/lib/rbac";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  const staff = token ? await verifyAdminToken(token) : null;
  if (!staff) return NextResponse.json({ success: false }, { status: 401 });
  if (!hasMinRole(staff.role, "frontdesk")) return forbidden("frontdesk");

  const { id } = await params;

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      booking: {
        select: {
          bookingNumber: true, checkIn: true, checkOut: true, nights: true,
          adults: true, children: true,
          room: { select: { name: true, roomNumber: true, roomType: true } },
        },
      },
      guest: {
        select: {
          firstName: true, lastName: true, phone: true, email: true,
          address: true, city: true, state: true, pincode: true, gstin: true, companyName: true,
        },
      },
    },
  });

  if (!invoice) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  return NextResponse.json({ success: true, invoice });
}
