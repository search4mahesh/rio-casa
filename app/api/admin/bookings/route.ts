import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { ok } from "@/lib/api-response";
import { positiveIntParam } from "@/lib/query-params";

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "frontdesk");
  if (!auth.ok) return auth.response;

  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status");
  const source = searchParams.get("source");
  const search = searchParams.get("search");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const page = positiveIntParam(searchParams.get("page"));
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

  return ok({ bookings, total, page, pageSize });
}
