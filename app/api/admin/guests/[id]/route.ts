import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAdminToken, ADMIN_COOKIE } from "@/lib/admin-auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  const staff = token ? await verifyAdminToken(token) : null;
  if (!staff) return NextResponse.json({ success: false }, { status: 401 });

  const { id } = await params;

  const guest = await prisma.guest.findUnique({
    where: { id },
    include: {
      bookings: {
        include: { room: { select: { name: true, roomNumber: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });

  if (!guest) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  return NextResponse.json({ success: true, guest });
}
