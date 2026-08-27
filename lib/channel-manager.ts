import { prisma } from "@/lib/prisma";
import { getAvailableRooms, createBooking, type BookingInput } from "@/lib/booking-service";

// ─────────────────────────────────────────────────────────────
// Channel-manager sync (eZee Centrix).
//
// Split out of lib/booking-service.ts, which had grown to ~1900 lines and 30+
// exports across availability, pricing, promos, document numbers, group
// booking, OTA sync, conflict detection, the night audit and hold sweeping.
// These three were the cleanest seam: nothing else in that module called them,
// and they need none of its transaction machinery.
//
// **This property does not use eZee.** `syncWithChannelManager` returns
// immediately without `EZEE_API_URL`, and `/api/cron/pull-ota` is deliberately
// unscheduled — see CHANNEL-MANAGER-PLAN.md. `detectConflicts` is the
// exception: it is read-only, runs nightly, and is a safety net over the
// exclusion constraint rather than anything to do with OTAs.
//
// The dependency runs one way only: this module imports `getAvailableRooms`
// and `createBooking` from booking-service, and booking-service imports
// nothing back. Re-exporting these from there would have made the cycle,
// which is why the three call sites import from here instead.
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────
// LAYER 4: CHANNEL MANAGER SYNC
// Call immediately after a successful booking (fire-and-forget).
// Pushes inventory block to eZee Centrix → propagates to OTAs.
// ─────────────────────────────────────────────

export async function syncWithChannelManager(bookingId: string): Promise<void> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { room: true },
  });
  if (!booking || !process.env.EZEE_API_URL) return;

  try {
    const res = await fetch(`${process.env.EZEE_API_URL}/inventory/update`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.EZEE_API_KEY}`,
      },
      body: JSON.stringify({
        room_type: booking.room.roomType,
        date_from: booking.checkIn,
        date_to: booking.checkOut,
        available: false,
      }),
    });

    const result = await res.json();

    await prisma.channelSyncLog.create({
      data: {
        direction: "push",
        channel: "ezee_centrix",
        action: "inventory_update",
        payload: { bookingId, roomType: booking.room.roomType },
        response: result,
        status: res.ok ? "success" : "failed",
        errorMessage: res.ok ? null : JSON.stringify(result),
        bookingId,
      },
    });

    if (!res.ok) {
      console.error(
        `[channel-sync] Failed for ${booking.bookingNumber} — update OTAs manually: ` +
          `${booking.room.roomNumber ?? booking.room.name} blocked ${booking.checkIn} → ${booking.checkOut}`
      );
    }
  } catch (err) {
    await prisma.channelSyncLog.create({
      data: {
        direction: "push",
        channel: "ezee_centrix",
        action: "inventory_update",
        payload: { bookingId },
        status: "failed",
        errorMessage: (err as Error).message,
        bookingId,
      },
    });
    console.error(`[channel-sync] ERROR for booking ${bookingId}:`, err);
  }
}

// Pull new OTA bookings from eZee Centrix — run every 3 minutes via cron
export async function pullOTABookings(): Promise<void> {
  if (!process.env.EZEE_API_URL) return;

  try {
    const res = await fetch(`${process.env.EZEE_API_URL}/bookings/new`, {
      headers: { Authorization: `Bearer ${process.env.EZEE_API_KEY}` },
    });
    const otaBookings: Array<{
      confirmation_id: string;
      source: string;
      room_type: string;
      check_in: string;
      check_out: string;
      adults?: number;
      children?: number;
      guest: { first_name?: string; last_name?: string; name?: string; phone?: string; email?: string };
      special_requests?: string;
    }> = await res.json();

    for (const ota of otaBookings) {
      const exists = await prisma.booking.findFirst({ where: { sourceBookingId: ota.confirmation_id } });
      if (exists) continue;

      // Find an available room of the requested type
      const checkIn = new Date(ota.check_in);
      const checkOut = new Date(ota.check_out);
      const rooms = await getAvailableRooms(checkIn, checkOut, (ota.adults ?? 2) + (ota.children ?? 0));
      const room = rooms.find((r) => r.roomType === ota.room_type);

      if (!room) {
        console.error(`[ota-pull] No room available for OTA booking ${ota.confirmation_id} — handle manually`);
        continue;
      }

      const nameParts = ((ota.guest.first_name ?? "") + " " + (ota.guest.last_name ?? ota.guest.name ?? "Guest")).trim();
      await createBooking({
        roomId: room.id,
        checkIn,
        checkOut,
        adults: ota.adults ?? 2,
        children: ota.children ?? 0,
        guestName: nameParts,
        guestEmail: ota.guest.email ?? "",
        guestPhone: ota.guest.phone ?? "N/A",
        source: ota.source as BookingInput["source"],
        specialRequests: ota.special_requests,
        sourceBookingId: ota.confirmation_id,
      });
    }
  } catch (err) {
    console.error("[ota-pull] Failed:", err);
  }
}

// ─────────────────────────────────────────────
// LAYER 5: CONFLICT DETECTOR (run hourly via cron)
// The "oh shit" safety net — queries for any double-booked dates
// that somehow exist in the DB and alerts the owner.
// ─────────────────────────────────────────────

export async function detectConflicts(): Promise<Array<Record<string, unknown>>> {
  const conflicts = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT
      a.booking_number AS booking_a,
      b.booking_number AS booking_b,
      r.name           AS room_name,
      a.check_in       AS a_checkin,
      a.check_out      AS a_checkout,
      b.check_in       AS b_checkin,
      b.check_out      AS b_checkout,
      a.source         AS a_source,
      b.source         AS b_source
    FROM bookings a
    JOIN bookings b
      ON a.room_id = b.room_id
      AND a.id < b.id
      AND a.check_in < b.check_out
      AND a.check_out > b.check_in
    JOIN rooms r ON r.id = a.room_id
    WHERE a.status NOT IN ('cancelled', 'no_show')
      AND b.status NOT IN ('cancelled', 'no_show')
      AND a.payment_status != 'failed'
      AND b.payment_status != 'failed'
  `;

  if (conflicts.length > 0) {
    console.error("[conflict-detector] DOUBLE BOOKINGS FOUND:", JSON.stringify(conflicts, null, 2));
    // TODO: send WhatsApp alert via WATI/Twilio when WATI_API_KEY is set
  }

  return conflicts;
}
