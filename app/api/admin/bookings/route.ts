import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAdminToken, ADMIN_COOKIE } from "@/lib/admin-auth";
import { hasMinRole, forbidden } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  const staff = token ? await verifyAdminToken(token) : null;
  if (!staff) return NextResponse.json({ success: false }, { status: 401 });
  if (!hasMinRole(staff.role, "frontdesk")) return forbidden("frontdesk");

  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status");
  const source = searchParams.get("source");
  const search = searchParams.get("search");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const pageSize = 25;

  const where: Record<string, unknown> = {};
  if (status && status !== "all") where.status = status;
  if (source && source !== "all") where.source = source;
  if (from || to) {
    where.checkIn = {};
    if (from) (where.checkIn as Record<string, Date>).gte = new Date(from);
    if (to) (where.checkIn as Record<string, Date>).lte = new Date(to);
  }
  if (search) {
    where.OR = [
      { guestName: { contains: search, mode: "insensitive" } },
      { guestEmail: { contains: search, mode: "insensitive" } },
      { guestPhone: { contains: search } },
      { bookingNumber: { contains: search, mode: "insensitive" } },
    ];
  }

  const [total, bookings] = await Promise.all([
    prisma.booking.count({ where }),
    prisma.booking.findMany({
      where,
      include: { room: { select: { name: true, roomNumber: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return NextResponse.json({ success: true, bookings, total, page, pageSize });
}
