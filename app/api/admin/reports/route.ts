import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { ok } from "@/lib/api-response";
import { dateOnly, today, addDays, addMonths, startOfMonth, daysBetween, toDayString } from "@/lib/dates";

// GET /api/admin/reports?from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "manager");
  if (!auth.ok) return auth.response;

  const { searchParams } = req.nextUrl;
  const rawFrom = searchParams.get("from");
  const rawTo = searchParams.get("to");

  // Calendar days against DATE columns — see lib/dates.ts. Local-midnight
  // bounds shifted the window a day earlier, so a report "from 1 Sep" quietly
  // started on 31 Aug.
  let from: Date;
  let to: Date;
  try {
    // Default: last 12 months, ending today.
    to = rawTo ? dateOnly(rawTo) : today();
    from = rawFrom ? dateOnly(rawFrom) : addMonths(to, -12);
  } catch {
    return NextResponse.json({ success: false, error: "Invalid date format. Use YYYY-MM-DD" }, { status: 400 });
  }
  if (to < from) {
    return NextResponse.json({ success: false, error: "End date must be after start date" }, { status: 400 });
  }

  // `to` is an inclusive calendar day, so the exclusive bound is the next day.
  const toExclusive = addDays(to, 1);

  // Total available room-nights = active rooms × days in range
  const activeRoomCount = await prisma.room.count({ where: { isActive: true } });
  const daysInRange = Math.max(1, daysBetween(from, toExclusive));
  const totalAvailableNights = activeRoomCount * daysInRange;

  // All bookings that fall within range (overlapping)
  const bookings = await prisma.booking.findMany({
    where: {
      checkIn: { lt: toExclusive },
      checkOut: { gt: from },
      status: { notIn: ["cancelled", "no_show"] },
    },
    select: {
      id: true, checkIn: true, checkOut: true, nights: true,
      totalAmount: true, source: true, adults: true, children: true,
      room: { select: { roomType: true } },
    },
  });

  let occupiedNights = 0;
  let totalRevenue = 0;
  let totalGuests = 0;

  // Source breakdown
  const sourceCount: Record<string, number> = {};
  const sourceRevenue: Record<string, number> = {};

  // Room type contribution
  const roomTypeRevenue: Record<string, number> = {};
  const roomTypeBookings: Record<string, number> = {};

  // Monthly occupancy + revenue series. Keyed in UTC to match the DATE values.
  const monthKey = (d: Date) => toDayString(d).slice(0, 7);
  const monthlyOccupied: Record<string, number> = {};
  const monthlyRevenue: Record<string, number> = {};
  const monthlyBookings: Record<string, number> = {};

  // Build month buckets
  const months: string[] = [];
  for (let cursor = startOfMonth(from); cursor <= to; cursor = addMonths(cursor, 1)) {
    const key = monthKey(cursor);
    months.push(key);
    monthlyOccupied[key] = 0;
    monthlyRevenue[key] = 0;
    monthlyBookings[key] = 0;
  }

  for (const b of bookings) {
    const inDate = b.checkIn > from ? b.checkIn : from;
    const outDate = b.checkOut < toExclusive ? b.checkOut : toExclusive;
    const overlapNights = Math.max(0, daysBetween(inDate, outDate));
    occupiedNights += overlapNights;
    totalRevenue += Number(b.totalAmount);
    totalGuests += b.adults + b.children;

    const src = b.source || "website";
    sourceCount[src] = (sourceCount[src] ?? 0) + 1;
    sourceRevenue[src] = (sourceRevenue[src] ?? 0) + Number(b.totalAmount);

    const rt = b.room.roomType || "other";
    roomTypeRevenue[rt] = (roomTypeRevenue[rt] ?? 0) + Number(b.totalAmount);
    roomTypeBookings[rt] = (roomTypeBookings[rt] ?? 0) + 1;

    // Allocate to month buckets — book by check-in month for revenue/bookings,
    // distribute occupied nights across actual months
    const inMonth = monthKey(b.checkIn);
    if (monthlyRevenue[inMonth] !== undefined) {
      monthlyRevenue[inMonth] += Number(b.totalAmount);
      monthlyBookings[inMonth] += 1;
    }

    // Walk each night of the stay and bucket by month
    const nightCursor = new Date(b.checkIn);
    const stayEnd = new Date(b.checkOut);
    while (nightCursor < stayEnd) {
      const nk = monthKey(nightCursor);
      if (monthlyOccupied[nk] !== undefined) monthlyOccupied[nk] += 1;
      nightCursor.setDate(nightCursor.getDate() + 1);
    }
  }

  const totalBookings = bookings.length;
  const occupancyRate = totalAvailableNights > 0 ? (occupiedNights / totalAvailableNights) * 100 : 0;
  const adr = occupiedNights > 0 ? totalRevenue / occupiedNights : 0;
  const revpar = totalAvailableNights > 0 ? totalRevenue / totalAvailableNights : 0;
  const avgLOS = totalBookings > 0 ? bookings.reduce((s, b) => s + b.nights, 0) / totalBookings : 0;

  // Monthly series — convert to arrays with occupancy %
  const daysInMonthFor = (key: string) => {
    const [y, m] = key.split("-").map(Number);
    return new Date(y, m, 0).getDate();
  };

  const monthlySeries = months.map((key) => ({
    month: key,
    revenue: Math.round(monthlyRevenue[key]),
    bookings: monthlyBookings[key],
    occupied: monthlyOccupied[key],
    occupancyPct: activeRoomCount > 0
      ? (monthlyOccupied[key] / (activeRoomCount * daysInMonthFor(key))) * 100
      : 0,
  }));

  const sourceBreakdown = Object.entries(sourceCount).map(([source, count]) => ({
    source,
    bookings: count,
    revenue: Math.round(sourceRevenue[source]),
    pct: totalBookings > 0 ? (count / totalBookings) * 100 : 0,
  })).sort((a, b) => b.bookings - a.bookings);

  const roomTypeBreakdown = Object.entries(roomTypeRevenue).map(([roomType, revenue]) => ({
    roomType,
    bookings: roomTypeBookings[roomType],
    revenue: Math.round(revenue),
    pct: totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0,
  })).sort((a, b) => b.revenue - a.revenue);

  return ok({
      from: from.toISOString(),
      to: to.toISOString(),
      daysInRange,
      activeRoomCount,
      kpi: {
        occupancyRate: Math.round(occupancyRate * 10) / 10,
        adr: Math.round(adr),
        revpar: Math.round(revpar),
        totalRevenue: Math.round(totalRevenue),
        totalBookings,
        totalGuests,
        avgLOS: Math.round(avgLOS * 10) / 10,
        occupiedNights,
        totalAvailableNights,
      },
      monthlySeries,
      sourceBreakdown,
      roomTypeBreakdown,
    });
}
