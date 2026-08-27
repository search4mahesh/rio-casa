import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { ok, fail } from "@/lib/api-response";
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
    return fail("Invalid date format. Use YYYY-MM-DD", 400);
  }
  if (to < from) {
    return fail("End date must be after start date", 400);
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

  // Revenue is earned per night, and every figure below is measured over the
  // nights that fall inside the report window.
  //
  // It used to add each booking's whole `totalAmount` while occupied nights
  // were clamped to the window. Two things came out wrong. The monthly bars
  // dropped revenue entirely for any stay that checked in before the range —
  // its check-in month had no bucket — while the KPI still counted it. And ADR,
  // which divides revenue by occupied nights, mixed a whole-stay numerator with
  // a clipped denominator: a 30-night ₹30,000 stay clipped to 5 nights reported
  // ₹6,000 a night instead of ₹1,000.
  //
  // A range covering whole months is unaffected — nothing is clipped, so every
  // stay contributes its full amount exactly as before.
  for (const b of bookings) {
    const inDate = b.checkIn > from ? b.checkIn : from;
    const outDate = b.checkOut < toExclusive ? b.checkOut : toExclusive;
    const overlapNights = Math.max(0, daysBetween(inDate, outDate));
    if (overlapNights === 0) continue;

    // Derived from the dates rather than the stored `nights` column, which is
    // maintained separately and can drift.
    const stayNights = Math.max(1, daysBetween(b.checkIn, b.checkOut));
    const perNight = Number(b.totalAmount) / stayNights;
    const revenueInWindow = perNight * overlapNights;

    occupiedNights += overlapNights;
    totalRevenue += revenueInWindow;
    totalGuests += b.adults + b.children;

    const src = b.source || "website";
    sourceCount[src] = (sourceCount[src] ?? 0) + 1;
    sourceRevenue[src] = (sourceRevenue[src] ?? 0) + revenueInWindow;

    const rt = b.room.roomType || "other";
    roomTypeRevenue[rt] = (roomTypeRevenue[rt] ?? 0) + revenueInWindow;
    roomTypeBookings[rt] = (roomTypeBookings[rt] ?? 0) + 1;

    // A booking counts toward the month it first occupies *within the window*,
    // not the month it checked in. Bucketing by raw check-in dropped bookings
    // that started before the range from the series while `totalBookings` still
    // counted them; clamping means every booking lands in exactly one bucket
    // and the bars sum to the headline.
    monthlyBookings[monthKey(inDate)] += 1;

    // Walk the in-window nights, bucketing occupancy and revenue together so
    // the two can never diverge. Every clamped night's month has a bucket,
    // because the buckets span startOfMonth(from) → to.
    for (let night = inDate; night < outDate; night = addDays(night, 1)) {
      const nk = monthKey(night);
      if (monthlyOccupied[nk] === undefined) continue;
      monthlyOccupied[nk] += 1;
      monthlyRevenue[nk] += perNight;
    }
  }

  const totalBookings = bookings.length;
  const occupancyRate = totalAvailableNights > 0 ? (occupiedNights / totalAvailableNights) * 100 : 0;
  const adr = occupiedNights > 0 ? totalRevenue / occupiedNights : 0;
  const revpar = totalAvailableNights > 0 ? totalRevenue / totalAvailableNights : 0;
  const avgLOS = totalBookings > 0 ? bookings.reduce((s, b) => s + b.nights, 0) / totalBookings : 0;

  // Monthly series — convert to arrays with occupancy %
  //
  // The denominator is the days of the month that fall *inside the report
  // window*, not the whole month. Now that occupied nights are clamped, using
  // the full month would report the first and last months of any partial range
  // as near-empty: 5 occupied nights measured against 30 days of capacity that
  // was never on offer.
  const daysInRangeFor = (key: string) => {
    const monthStart = dateOnly(`${key}-01`);
    const monthEnd = addMonths(monthStart, 1);
    const start = monthStart > from ? monthStart : from;
    const end = monthEnd < toExclusive ? monthEnd : toExclusive;
    return Math.max(0, daysBetween(start, end));
  };

  const monthlySeries = months.map((key) => {
    const capacity = activeRoomCount * daysInRangeFor(key);
    return {
      month: key,
      revenue: Math.round(monthlyRevenue[key]),
      bookings: monthlyBookings[key],
      occupied: monthlyOccupied[key],
      occupancyPct: capacity > 0 ? (monthlyOccupied[key] / capacity) * 100 : 0,
    };
  });

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
