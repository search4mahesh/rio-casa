import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { ok, fail } from "@/lib/api-response";
import { today as todayDate, addDays } from "@/lib/dates";

// GET /api/admin/rooms/status — all rooms with current status + today's due check-ins
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  // Calendar days against DATE columns — see lib/dates.ts.
  const today = todayDate();
  const tomorrow = addDays(today, 1);

  // Read flat and reassembled below, rather than as one nested `include`.
  // A relation select is a round trip of its own, so the nested form issued
  // five: rooms, statuses, the guest of each occupied room, the booking of
  // each occupied room, and today's arrivals. This is the board staff keep
  // open all day, and it was the heaviest request in the profiler.
  //
  // The shape returned is byte-for-byte what it was — `RoomBoard.tsx` reads
  // `room.roomStatus.currentGuest` and `.currentBooking` and does not need to
  // know any of this changed.
  const [rooms, statuses] = await Promise.all([
    prisma.room.findMany({
      where: { isActive: true },
      orderBy: [{ floor: "asc" }, { roomNumber: "asc" }],
    }),
    prisma.roomStatus.findMany(),
  ]);

  const statusByRoom = new Map(statuses.map((s) => [s.roomId, s]));
  const currentBookingIds = statuses.map((s) => s.currentBookingId).filter((id): id is string => Boolean(id));
  const currentGuestIds = statuses.map((s) => s.currentGuestId).filter((id): id is string => Boolean(id));

  // The occupying bookings and today's arrivals are both `bookings` rows, so
  // they are one statement with a widened predicate and split in memory — the
  // same trade the night-audit summary makes for its adjacent windows. A
  // booking can legitimately be in both sets (a room whose guest checks out and
  // whose next guest arrives today), so membership is tested independently
  // rather than by partitioning.
  // An empty `in` matches nothing rather than everything, so no branch is
  // needed for a property with no occupied rooms — the OR collapses to the
  // arrivals half on its own.
  const [bookings, guests] = await Promise.all([
    prisma.booking.findMany({
      where: {
        OR: [
          { id: { in: currentBookingIds } },
          { checkIn: { gte: today, lt: tomorrow }, status: "confirmed" },
        ],
      },
      select: {
        id: true, roomId: true, guestName: true, bookingNumber: true,
        checkOut: true, adults: true, status: true, checkIn: true,
      },
    }),
    // This one *is* skipped when there is nothing to look up: unlike the query
    // above it has no second half to serve, so issuing it would buy nothing.
    currentGuestIds.length > 0
      ? prisma.guest.findMany({
          where: { id: { in: currentGuestIds } },
          select: { id: true, firstName: true, lastName: true, phone: true },
        })
      : Promise.resolve([]),
  ]);

  const bookingById = new Map(bookings.map((b) => [b.id, b]));
  const guestById = new Map(guests.map((g) => [g.id, g]));

  const dueCheckinMap: Record<string, { id: string; guestName: string; bookingNumber: string }> = {};
  for (const b of bookings) {
    // The arrivals half of the widened query above.
    if (b.status === "confirmed" && b.checkIn >= today && b.checkIn < tomorrow) {
      dueCheckinMap[b.roomId] = { id: b.id, guestName: b.guestName, bookingNumber: b.bookingNumber };
    }
  }

  const enriched = rooms.map((room) => {
    const status = statusByRoom.get(room.id) ?? null;
    const guest = status?.currentGuestId ? guestById.get(status.currentGuestId) ?? null : null;
    const booking = status?.currentBookingId ? bookingById.get(status.currentBookingId) ?? null : null;

    return {
      ...room,
      roomStatus: status
        ? {
            ...status,
            currentGuest: guest
              ? { firstName: guest.firstName, lastName: guest.lastName, phone: guest.phone }
              : null,
            currentBooking: booking
              ? {
                  id: booking.id,
                  checkOut: booking.checkOut,
                  bookingNumber: booking.bookingNumber,
                  adults: booking.adults,
                  status: booking.status,
                }
              : null,
          }
        : null,
      dueCheckin: dueCheckinMap[room.id] ?? null,
    };
  });

  return ok(enriched);
}

const PatchSchema = z.object({
  roomId: z.string(),
  occupancy: z.enum(["vacant", "occupied", "due_checkout", "due_checkin", "out_of_order"]).optional(),
  housekeeping: z.enum(["clean", "dirty", "cleaning", "inspected", "out_of_order"]).optional(),
  notes: z.string().optional(),
});

// PATCH /api/admin/rooms/status — update room occupancy / housekeeping
export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;
  const staff = auth.staff;

  try {
    const body = await req.json();
    const { roomId, occupancy, housekeeping, notes } = PatchSchema.parse(body);

    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (occupancy !== undefined) update.occupancy = occupancy;
    if (housekeeping !== undefined) {
      update.housekeeping = housekeeping;
      if (housekeeping === "clean") {
        update.lastCleanedAt = new Date();
        update.cleanedBy = staff.name;
      }
    }
    if (notes !== undefined) update.notes = notes;

    const status = await prisma.roomStatus.upsert({
      where: { roomId },
      create: { roomId, ...update },
      update,
    });

    await prisma.auditLog.create({
      data: {
        userId: staff.staffId,
        action: "update_room_status",
        entityType: "room",
        entityId: roomId,
        newValue: update as Record<string, string | number | boolean | null>,
      },
    });

    return ok(status);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return fail("Invalid input", 400);
    }
    console.error(err);
    return fail("Server error", 500);
  }
}
