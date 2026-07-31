import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { ok, failValidation } from "@/lib/api-response";

const SLOT = z.enum(["morning", "evening", "night"]);
const STATION = z.enum(["frontdesk", "housekeeping", "kitchen"]);

const UpsertSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  slot: SLOT,
  station: STATION,
  staffId: z.string().min(1),
  notes: z.string().max(500).nullable().optional(),
});

// GET /api/admin/shifts?weekStart=YYYY-MM-DD — returns 7 days of assignments + all active staff
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "manager");
  if (!auth.ok) return auth.response;

  const { searchParams } = req.nextUrl;
  const weekStartParam = searchParams.get("weekStart");

  if (!weekStartParam || !/^\d{4}-\d{2}-\d{2}$/.test(weekStartParam)) {
    return NextResponse.json({ success: false, error: "weekStart (YYYY-MM-DD) is required" }, { status: 400 });
  }

  const weekStart = new Date(weekStartParam + "T00:00:00");
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const [assignments, staffList] = await Promise.all([
    prisma.shiftAssignment.findMany({
      where: { date: { gte: weekStart, lt: weekEnd } },
      include: { staff: { select: { id: true, name: true, role: true } } },
      orderBy: [{ date: "asc" }, { slot: "asc" }, { station: "asc" }],
    }),
    prisma.staff.findMany({
      where: { isActive: true },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return ok({ weekStart: weekStart.toISOString().split("T")[0], weekEnd: weekEnd.toISOString().split("T")[0], assignments, staff: staffList });
}

// POST /api/admin/shifts — upsert assignment by (date, slot, station)
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, "manager");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = UpsertSchema.safeParse(body);
  if (!parsed.success) {
    return failValidation(parsed.error);
  }

  const { date, slot, station, staffId, notes } = parsed.data;

  const exists = await prisma.staff.findUnique({ where: { id: staffId }, select: { id: true, isActive: true } });
  if (!exists) return NextResponse.json({ success: false, error: "Staff member not found" }, { status: 400 });
  if (!exists.isActive) return NextResponse.json({ success: false, error: "Cannot assign inactive staff" }, { status: 400 });

  const dateObj = new Date(date + "T00:00:00");

  const assignment = await prisma.shiftAssignment.upsert({
    where: { date_slot_station: { date: dateObj, slot, station } },
    create: { date: dateObj, slot, station, staffId, notes: notes ?? null },
    update: { staffId, notes: notes ?? null },
    include: { staff: { select: { id: true, name: true, role: true } } },
  });

  return ok(assignment);
}
