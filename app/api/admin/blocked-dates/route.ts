import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyAdminToken, ADMIN_COOKIE } from "@/lib/admin-auth";
import { hasMinRole, forbidden } from "@/lib/rbac";

const CreateSchema = z.object({
  roomId: z.string().nullable().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format"),
  reason: z.string().max(200).optional(),
});

// GET /api/admin/blocked-dates — upcoming blocked dates
export async function GET(req: NextRequest) {
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  const staff = token ? await verifyAdminToken(token) : null;
  if (!staff) return NextResponse.json({ success: false }, { status: 401 });
  if (!hasMinRole(staff.role, "frontdesk")) return forbidden("frontdesk");

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const blocked = await prisma.blockedDate.findMany({
    where: { blockDate: { gte: today } },
    include: { room: { select: { name: true, roomNumber: true, roomType: true } } },
    orderBy: [{ blockDate: "asc" }, { roomId: "asc" }],
    take: 500,
  });

  return NextResponse.json({ success: true, blocked });
}

// POST /api/admin/blocked-dates — block a date range for a room (or all rooms)
export async function POST(req: NextRequest) {
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  const staff = token ? await verifyAdminToken(token) : null;
  if (!staff) return NextResponse.json({ success: false }, { status: 401 });
  if (!hasMinRole(staff.role, "frontdesk")) return forbidden("frontdesk");

  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { roomId, startDate, endDate, reason } = parsed.data;

  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");

  if (end < start) {
    return NextResponse.json({ success: false, error: "End date must be on or after start date" }, { status: 400 });
  }

  // Expand date range into individual day records
  const dates: Date[] = [];
  const d = new Date(start);
  while (d <= end) {
    dates.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }

  if (dates.length > 90) {
    return NextResponse.json({ success: false, error: "Cannot block more than 90 days at once" }, { status: 400 });
  }

  await prisma.blockedDate.createMany({
    data: dates.map((date) => ({
      roomId: roomId ?? null,
      blockDate: date,
      reason: reason ?? null,
    })),
  });

  return NextResponse.json({ success: true, count: dates.length });
}
