import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { ok } from "@/lib/api-response";

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

  if (from) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(from);
    if (!m) {
      return NextResponse.json({ success: false, error: "Use YYYY-MM-DD for from" }, { status: 400 });
    }
    rangeStart = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (isNaN(rangeStart.getTime())) {
      return NextResponse.json({ success: false, error: "Invalid from date" }, { status: 400 });
    }
    const requested = parseInt(searchParams.get("days") ?? "60", 10);
    rangeDays = Math.min(MAX_RANGE_DAYS, Math.max(1, isNaN(requested) ? 60 : requested));
  } else {
    const rawMonth = searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
    const parts = rawMonth.split("-");
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);

    if (!year || !month || month < 1 || month > 12 || isNaN(year)) {
      return NextResponse.json({ success: false, error: "Use YYYY-MM format" }, { status: 400 });
    }

    monthStart = new Date(year, month - 1, 1);
    daysInMonth = new Date(year, month, 0).getDate();
    rangeStart = monthStart;
    rangeDays = daysInMonth;
  }

  const rangeEnd = new Date(rangeStart);
  rangeEnd.setDate(rangeEnd.getDate() + rangeDays);

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
  // for anyone east or west of the server's timezone.
  const isoDay = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

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
    rangeStart: isoDay(rangeStart),
    days: rangeDays,
    // Month-mode only — null when called with ?from=
    daysInMonth,
    monthStart: monthStart ? monthStart.toISOString() : null,
  });
}
