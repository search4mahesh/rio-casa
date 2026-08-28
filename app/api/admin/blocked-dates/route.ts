import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { ok, failValidation, fail } from "@/lib/api-response";
import { clientIp } from "@/lib/rate-limit";
import { dateOnly, today as todayDate, addDays, isDayString } from "@/lib/dates";

const CreateSchema = z.object({
  roomId: z.string().nullable().optional(),
  startDate: z.string().refine(isDayString, "Use YYYY-MM-DD format"),
  endDate: z.string().refine(isDayString, "Use YYYY-MM-DD format"),
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
//
// `manager`, while GET above stays `frontdesk`. Reading the list is part of
// answering the phone — the desk has to know a room is closed before promising
// it. Creating one takes inventory off the calendar with no booking to account
// for it, which is the single cheapest way to make a room disappear and sell it
// for cash. Splitting read from write costs the desk nothing they actually do.
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, "manager");
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
    return fail("End date must be on or after start date", 400);
  }

  // Expand date range into individual day records (inclusive of both ends)
  const dates: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    dates.push(d);
  }

  if (dates.length > 90) {
    return fail("Cannot block more than 90 days at once", 400);
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
      blockedBy: auth.staff.name,
    })),
    skipDuplicates: true,
  });

  // One audit row for the range, not one per day: the staff member performed a
  // single act, and 90 rows recording it would bury the rest of the log. There
  // is no per-row id to reference anyway — `createMany` returns only a count —
  // so the entity is the room the block targets, or "all" for a property-wide
  // closure, matching how `roomId: null` reads everywhere else.
  //
  // `count` rather than `dates.length`: `skipDuplicates` means the two differ
  // whenever a range overlaps one already blocked (B-10), and the log should
  // record what changed, not what was asked for.
  await prisma.auditLog.create({
    data: {
      userId: auth.staff.staffId,
      action: "blocked_dates_created",
      entityType: "blocked_date",
      entityId: roomId ?? "all",
      newValue: { startDate, endDate, reason: reason ?? null, daysBlocked: count },
      ipAddress: clientIp(req),
    },
  });

  return ok(count);
}
