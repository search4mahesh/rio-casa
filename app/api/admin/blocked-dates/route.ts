import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { ok, failValidation } from "@/lib/api-response";
import { dateOnly, today as todayDate, addDays } from "@/lib/dates";

const CreateSchema = z.object({
  roomId: z.string().nullable().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format"),
  reason: z.string().max(200).optional(),
});

// GET /api/admin/blocked-dates — upcoming blocked dates
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "frontdesk");
  if (!auth.ok) return auth.response;

  const blocked = await prisma.blockedDate.findMany({
    where: { blockDate: { gte: todayDate() } },
    include: { room: { select: { name: true, roomNumber: true, roomType: true } } },
    orderBy: [{ blockDate: "asc" }, { roomId: "asc" }],
    take: 500,
  });

  return ok(blocked);
}

// POST /api/admin/blocked-dates — block a date range for a room (or all rooms)
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, "frontdesk");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return failValidation(parsed.error);
  }

  const { roomId, startDate, endDate, reason } = parsed.data;

  // Calendar days, not local instants — see lib/dates.ts. Parsing these as
  // local midnight is what previously stored 19–20 Dec when staff asked for
  // 20–21, so the closed day stayed bookable.
  const start = dateOnly(startDate);
  const end = dateOnly(endDate);

  if (end < start) {
    return NextResponse.json({ success: false, error: "End date must be on or after start date" }, { status: 400 });
  }

  // Expand date range into individual day records (inclusive of both ends)
  const dates: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    dates.push(d);
  }

  if (dates.length > 90) {
    return NextResponse.json({ success: false, error: "Cannot block more than 90 days at once" }, { status: 400 });
  }

  // `skipDuplicates` against the partial unique indexes in
  // prisma/migrations/3_blocked_dates_unique. Blocking a range that overlaps
  // one already blocked used to insert a second row per shared day; unblocking
  // then deleted the visible row and left the room blocked by its twin, which
  // reads as the unblock having failed.
  //
  // Re-blocking is now idempotent, so the count returned is what was actually
  // added, not what was asked for.
  const { count } = await prisma.blockedDate.createMany({
    data: dates.map((date) => ({
      roomId: roomId ?? null,
      blockDate: date,
      reason: reason ?? null,
    })),
    skipDuplicates: true,
  });

  return ok(count);
}
