import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { ok } from "@/lib/api-response";
import { dateOnly, addDays, addMonths, daysBetween, toDayString, propertyDayString } from "@/lib/dates";

const MAX_RANGE_DAYS = 180;

// GET /api/admin/calendar
//   ?from=YYYY-MM-DD&days=N   rolling window (used by the timeline view)
//   ?month=YYYY-MM            whole calendar month (kept for callers that
//                             still think in months; also the default)
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "frontdesk");
  if (!auth.ok) return auth.response;

  const { searchParams } = req.nextUrl;
  const from = searchParams.get("from");

  let rangeStart: Date;
  let rangeDays: number;
  // Only meaningful in month mode; kept in the response for back-compat.
  let monthStart: Date | null = null;
  let daysInMonth: number | null = null;

  // Calendar days against DATE columns — see lib/dates.ts. Every bound below
  // is UTC midnight. Built with `new Date(y, m, d)` they were local midnight,
  // which in IST is 18:30 UTC on the *previous* day: Postgres cast that back a
  // day, so the timeline fetched one day early at both ends and the blocked-
  // date query pulled in the day before the window.
  if (from) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) {
      return NextResponse.json({ success: false, error: "Use YYYY-MM-DD for from" }, { status: 400 });
    }
    try {
      rangeStart = dateOnly(from);
    } catch {
      return NextResponse.json({ success: false, error: "Invalid from date" }, { status: 400 });
    }
    const requested = parseInt(searchParams.get("days") ?? "60", 10);
    rangeDays = Math.min(MAX_RANGE_DAYS, Math.max(1, isNaN(requested) ? 60 : requested));
  } else {
    // Default to the current month *at the property*, not on the server.
    const rawMonth = searchParams.get("month") ?? propertyDayString().slice(0, 7);

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(rawMonth)) {
      return NextResponse.json({ success: false, error: "Use YYYY-MM format" }, { status: 400 });
    }

    monthStart = dateOnly(`${rawMonth}-01`);
    daysInMonth = daysBetween(monthStart, addMonths(monthStart, 1));
    rangeStart = monthStart;
    rangeDays = daysInMonth;
  }

  const rangeEnd = addDays(rangeStart, rangeDays);

  const [rooms, bookings, blockedDates] = await Promise.all([
    prisma.room.findMany({
      where: { isActive: true },
      select: { id: true, name: true, roomNumber: true, roomType: true, floor: true },
      orderBy: [{ floor: "asc" }, { roomNumber: "asc" }],
    }),
    prisma.booking.findMany({
      where: {
        checkIn: { lt: rangeEnd },
        checkOut: { gt: rangeStart },
        status: { notIn: ["cancelled"] },
      },
      select: {
        id: true, bookingNumber: true, guestName: true, roomId: true,
        checkIn: true, checkOut: true, nights: true, status: true, adults: true,
        totalAmount: true,
      },
      orderBy: { checkIn: "asc" },
    }),
    prisma.blockedDate.findMany({
      where: { blockDate: { gte: rangeStart, lt: rangeEnd } },
      select: { id: true, roomId: true, blockDate: true, reason: true },
    }),
  ]);

  // Dates go out as plain YYYY-MM-DD, not ISO instants: the client keys
  // cells by calendar day, and an instant would shift across the date line
  // for anyone east or west of the server's timezone. `toDayString` reads the
  // UTC components — the local getters this used to call reintroduced exactly
  // the shift the format is meant to avoid.
  return ok({
    rooms,
    bookings: bookings.map((b) => ({
      ...b,
      checkIn: b.checkIn.toISOString(),
      checkOut: b.checkOut.toISOString(),
    })),
    blockedDates: blockedDates.map((bd) => ({
      ...bd,
      blockDate: bd.blockDate.toISOString(),
    })),
    rangeStart: toDayString(rangeStart),
    days: rangeDays,
    // Month-mode only — null when called with ?from=
    daysInMonth,
    monthStart: monthStart ? monthStart.toISOString() : null,
  });
}
