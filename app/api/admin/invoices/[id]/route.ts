import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { ok } from "@/lib/api-response";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, "frontdesk");
  if (!auth.ok) return auth.response;

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

  return ok(invoice);
}
