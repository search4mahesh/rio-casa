import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { ok } from "@/lib/api-response";
import { today as todayDate, addDays } from "@/lib/dates";

// GET /api/admin/night-audit/summary — today's operational snapshot
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "manager");
  if (!auth.ok) return auth.response;

  // Calendar days against DATE columns — see lib/dates.ts.
  const today = todayDate();
  const tomorrow = addDays(today, 1);
  const yesterday = addDays(today, -1);

  // `roomId` rather than a `room: { select: … }` relation. A relation select is
  // a second round trip *per* findMany that uses it, and this select is shared
  // by every list below — so the identical rooms query was issued four times to
  // render one snapshot. The rooms are fetched once and attached in memory.
  const bookingSelect = {
    id: true, bookingNumber: true, guestName: true, guestPhone: true,
    checkIn: true, checkOut: true, nights: true, totalAmount: true,
    status: true, paymentStatus: true,
    roomId: true,
  };

  const [rooms, confirmedAroundToday, inHouse, revenue] = await Promise.all([
    // Not filtered on `isActive`: a room taken out of the catalogue can still
    // have a guest checked into it, and that stay belongs on this board.
    prisma.room.findMany({
      select: { id: true, name: true, roomNumber: true, roomType: true },
    }),
    // Today's arrivals and yesterday's no-shows are the same statement over
    // adjacent days, so they are read as one two-day window and split below.
    prisma.booking.findMany({
      where: { checkIn: { gte: yesterday, lt: tomorrow }, status: "confirmed" },
      select: bookingSelect,
      orderBy: { checkIn: "asc" },
    }),
    prisma.booking.findMany({
      where: { status: "checked_in" },
      select: bookingSelect,
      orderBy: { checkOut: "asc" },
    }),
    prisma.booking.aggregate({
      where: { checkIn: { gte: today, lt: tomorrow }, paymentStatus: "paid" },
      _sum: { totalAmount: true },
    }),
  ]);

  // Due departures are `inHouse` narrowed to today and earlier — a filter, not
  // a query of its own. Both are `checked_in` ordered by `checkOut asc`, so the
  // slice keeps the oldest-first order that puts the ones needing a decision at
  // the top, and the deliberate absence of a lower bound comes with it: a
  // checkout the desk never pressed stays on this list instead of vanishing at
  // midnight (B-51).
  const departures = inHouse.filter((b) => b.checkOut < tomorrow);

  // Split of the two-day window above. Filtering preserves the `checkIn asc`
  // order each list was already returned in.
  const arrivals = confirmedAroundToday.filter((b) => b.checkIn >= today);
  const noShows = confirmedAroundToday.filter((b) => b.checkIn < today);

  const roomsById = new Map(rooms.map((r) => [r.id, r]));

  function present(list: typeof inHouse) {
    return list.map(({ roomId, ...b }) => {
      const room = roomsById.get(roomId);
      return {
        ...b,
        room: room
          ? { name: room.name, roomNumber: room.roomNumber, roomType: room.roomType }
          : null,
        checkIn: b.checkIn.toISOString(),
        checkOut: b.checkOut.toISOString(),
      };
    });
  }

  return ok({
      date: today.toISOString(),
      arrivals: present(arrivals),
      departures: present(departures),
      noShows: present(noShows),
      inHouse: present(inHouse),
      todayRevenue: Number(revenue._sum.totalAmount ?? 0),
    });
}
