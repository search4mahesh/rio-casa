// ─────────────────────────────────────────────
// lib/booking-service.ts
// 5-layer double booking protection + GST pricing + OTA sync stubs
//
// Layer 1: PostgreSQL exclusion constraint (prisma/migrations/1_double_booking_guard)
// Layer 2: Application-level availability check (fast pre-flight)
// Layer 3: Row-level locking inside serializable transaction (race condition guard)
// Layer 4: Channel manager sync — push to eZee Centrix after booking
// Layer 5: Conflict detector — hourly cron that catches anything that slipped through
// ─────────────────────────────────────────────

import { prisma } from "@/lib/prisma";
import { today as todayDate, addDays } from "@/lib/dates";
import { Prisma } from "@/lib/generated/prisma/client";

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

export interface BookingInput {
  roomId: string;
  checkIn: Date;
  checkOut: Date;
  adults: number;
  children?: number;
  extraBed?: boolean;
  // Inline guest data (website flow) — we findOrCreate the Guest record internally
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  source?: "website" | "walkin" | "phone" | "booking_com" | "mmt" | "goibibo";
  promoCode?: string;
  specialRequests?: string;
  sourceBookingId?: string;
}

export interface AvailabilityResult {
  available: boolean;
  conflictingBooking?: string;
}

export interface BookingResult {
  success: boolean;
  booking?: {
    id: string;
    bookingNumber: string;
    totalAmount: number;
    cgstAmount: number;
    sgstAmount: number;
    nights: number;
    room: { id: string; name: string; pricePerNight: number };
    guestName: string;
    guestEmail: string;
    checkIn: Date;
    checkOut: Date;
  };
  error?: string;
  errorCode?: "ROOM_NOT_AVAILABLE" | "INVALID_DATES" | "BLOCKED_DATE" | "UNKNOWN";
}

// ─────────────────────────────────────────────
// LAYER 2: APPLICATION-LEVEL AVAILABILITY CHECK
// Call this before showing the booking form to give a fast user-friendly error.
// Does NOT prevent race conditions — Layer 3 does that.
// ─────────────────────────────────────────────

export async function checkAvailability(
  roomId: string,
  checkIn: Date,
  checkOut: Date
): Promise<AvailabilityResult> {
  if (checkIn >= checkOut) return { available: false };

  if (checkIn < todayDate()) return { available: false };

  // Check blocked dates
  const blocked = await prisma.blockedDate.findFirst({
    where: {
      OR: [{ roomId }, { roomId: null }],
      blockDate: { gte: checkIn, lt: checkOut },
    },
  });
  if (blocked) return { available: false };

  // Check overlapping active bookings
  const conflict = await prisma.booking.findFirst({
    where: {
      roomId,
      status: { notIn: ["cancelled", "no_show"] },
      paymentStatus: { notIn: ["failed"] },
      checkIn: { lt: checkOut },
      checkOut: { gt: checkIn },
    },
    select: { bookingNumber: true },
  });

  return {
    available: conflict === null,
    conflictingBooking: conflict?.bookingNumber,
  };
}

// Check all rooms available for a date range
export async function getAvailableRooms(checkIn: Date, checkOut: Date, minGuests = 1) {
  const allRooms = await prisma.room.findMany({
    where: { isActive: true, maxGuests: { gte: minGuests } },
  });

  // Rooms with conflicting bookings
  const bookedRoomIds = await prisma.booking.findMany({
    where: {
      roomId: { in: allRooms.map((r) => r.id) },
      status: { notIn: ["cancelled", "no_show"] },
      paymentStatus: { notIn: ["failed"] },
      checkIn: { lt: checkOut },
      checkOut: { gt: checkIn },
    },
    select: { roomId: true },
    distinct: ["roomId"],
  });
  const bookedSet = new Set(bookedRoomIds.map((b) => b.roomId));

  // Rooms with blocked dates
  const blockedRoomIds = await prisma.blockedDate.findMany({
    where: {
      OR: [
        { roomId: { in: allRooms.map((r) => r.id) } },
        { roomId: null },
      ],
      blockDate: { gte: checkIn, lt: checkOut },
    },
    select: { roomId: true },
  });
  const blockedSet = new Set(blockedRoomIds.map((b) => b.roomId));

  return allRooms.filter((r) => !bookedSet.has(r.id) && !blockedSet.has(r.id) && !blockedSet.has(null));
}

// ─────────────────────────────────────────────
// LAYER 3: ROW-LEVEL LOCKING + BOOKING CREATION
// SELECT FOR UPDATE on the room row serialises concurrent requests
// for the same room. Combined with the DB exclusion constraint (Layer 1),
// this makes double booking impossible.
// ─────────────────────────────────────────────

/**
 * Postgres SERIALIZABLE expects clients to retry: two transactions that touch
 * the same rows can be aborted with a serialization failure (P2034) even when
 * one of them would have succeeded on its own. That is not an error condition,
 * it is the isolation level working — but without a retry it surfaced to the
 * guest as "Something went wrong."
 *
 * Only genuinely transient outcomes are retried. `ROOM_NOT_AVAILABLE` and
 * `BLOCKED_DATE` are deterministic answers and must fail fast; retrying them
 * would just burn the guest's time to reach the same conclusion.
 */
const TRANSIENT_TX_CODES = new Set([
  "P2034", // write conflict / deadlock — retry is the documented response
  "P2028", // transaction API error, incl. "unable to start in the given time"
]);

async function withSerializableRetry<T>(run: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await run();
    } catch (err) {
      const code = (err as { code?: string }).code;
      const message = (err as Error).message ?? "";
      if (message === "ROOM_NOT_AVAILABLE" || message === "BLOCKED_DATE") throw err;
      if (!code || !TRANSIENT_TX_CODES.has(code)) throw err;

      lastError = err;
      if (attempt === attempts) break;
      // Full jitter — without it, contending writers retry in lockstep and
      // collide again on the same boundary.
      const backoff = Math.random() * 100 * 2 ** (attempt - 1);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw lastError;
}

export async function createBooking(input: BookingInput): Promise<BookingResult> {
  if (input.checkIn >= input.checkOut) {
    return { success: false, error: "Check-out must be after check-in", errorCode: "INVALID_DATES" };
  }

  if (input.checkIn < todayDate()) {
    return { success: false, error: "Check-in date cannot be in the past", errorCode: "INVALID_DATES" };
  }

  try {
    const booking = await withSerializableRetry(() => prisma.$transaction(
      async (tx) => {
        // ── Step 1: Lock the room row ──────────────────────────────────
        // Any other transaction for this room blocks here until we commit.
        await tx.$queryRaw`SELECT id FROM rooms WHERE id = ${input.roomId} FOR UPDATE`;

        // ── Step 2: Re-check availability while locked ─────────────────
        const conflict = await tx.booking.findFirst({
          where: {
            roomId: input.roomId,
            status: { notIn: ["cancelled", "no_show"] },
            paymentStatus: { notIn: ["failed"] },
            checkIn: { lt: input.checkOut },
            checkOut: { gt: input.checkIn },
          },
        });
        if (conflict) throw new Error("ROOM_NOT_AVAILABLE");

        // Check blocked dates
        const blocked = await tx.blockedDate.findFirst({
          where: {
            OR: [{ roomId: input.roomId }, { roomId: null }],
            blockDate: { gte: input.checkIn, lt: input.checkOut },
          },
        });
        if (blocked) throw new Error("BLOCKED_DATE");

        // ── Step 3: Load room + apply rate plan ────────────────────────
        const room = await tx.room.findUniqueOrThrow({ where: { id: input.roomId } });

        const nights = Math.ceil(
          (input.checkOut.getTime() - input.checkIn.getTime()) / (1000 * 60 * 60 * 24)
        );

        // Look for an active rate plan; fall back to room.pricePerNight
        const ratePlan = await tx.ratePlan.findFirst({
          where: {
            roomType: room.roomType,
            isActive: true,
            validFrom: { lte: input.checkIn },
            validTo: { gte: input.checkOut },
          },
          orderBy: { priority: "desc" },
        });

        const nightlyRate = ratePlan ? Number(ratePlan.baseRate) : room.pricePerNight;
        const extraBedRate = input.extraBed && ratePlan ? Number(ratePlan.extraBedRate) : 0;

        // Weekend markup (Fri + Sat)
        let subtotal = 0;
        const cur = new Date(input.checkIn);
        for (let i = 0; i < nights; i++) {
          let rate = nightlyRate + extraBedRate;
          if (ratePlan && (cur.getDay() === 5 || cur.getDay() === 6)) {
            rate *= 1 + Number(ratePlan.weekendMarkup) / 100;
          }
          subtotal += rate;
          cur.setDate(cur.getDate() + 1);
        }

        // ── Step 4: Promo code ─────────────────────────────────────────
        let discount = 0;
        if (input.promoCode) {
          const promo = await tx.promotion.findFirst({
            where: {
              code: input.promoCode,
              isActive: true,
              validFrom: { lte: input.checkIn },
              validTo: { gte: input.checkIn },
              minNights: { lte: nights },
            },
          });
          if (promo && (!promo.usageLimit || promo.usedCount < promo.usageLimit)) {
            discount =
              promo.discountType === "percentage"
                ? Math.min(subtotal * (Number(promo.discountValue) / 100), Number(promo.maxDiscount ?? Infinity))
                : Number(promo.discountValue);
            await tx.promotion.update({
              where: { id: promo.id },
              data: { usedCount: { increment: 1 } },
            });
          }
        }

        // ── Step 5: GST calculation ────────────────────────────────────
        // GST on accommodation: 12% (CGST 6% + SGST 6%) if avg nightly ≤ ₹7,500
        //                       18% (CGST 9% + SGST 9%) if avg nightly > ₹7,500
        const taxableAmount = subtotal - discount;
        const avgNightly = taxableAmount / nights;
        const gstRate = avgNightly <= 7500 ? 6 : 9; // each component (CGST + SGST)
        const cgstAmount = Math.round(taxableAmount * gstRate) / 100;
        const sgstAmount = Math.round(taxableAmount * gstRate) / 100;
        const totalAmount = taxableAmount + cgstAmount + sgstAmount;

        // ── Step 6: Find or create Guest record ────────────────────────
        const nameParts = input.guestName.trim().split(/\s+/);
        const firstName = nameParts[0];
        const lastName = nameParts.slice(1).join(" ") || "-";

        let guest = await tx.guest.findFirst({ where: { phone: input.guestPhone } });
        if (!guest && input.guestEmail) {
          guest = await tx.guest.findFirst({ where: { email: input.guestEmail } });
        }
        if (!guest) {
          guest = await tx.guest.create({
            data: { firstName, lastName, email: input.guestEmail, phone: input.guestPhone },
          });
        }

        // ── Step 7: Generate booking number ────────────────────────────
        const dateStr = input.checkIn.toISOString().slice(0, 10).replace(/-/g, "");
        const dayStart = new Date(input.checkIn.toDateString());
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);
        const todayCount = await tx.booking.count({ where: { createdAt: { gte: dayStart, lt: dayEnd } } });
        const bookingNumber = `BK-${dateStr}-${String(todayCount + 1).padStart(3, "0")}`;

        // ── Step 8: Create booking ─────────────────────────────────────
        const booking = await tx.booking.create({
          data: {
            bookingNumber,
            guestId: guest.id,
            guestName: input.guestName,
            guestEmail: input.guestEmail,
            guestPhone: input.guestPhone,
            roomId: input.roomId,
            checkIn: input.checkIn,
            checkOut: input.checkOut,
            nights,
            adults: input.adults,
            children: input.children ?? 0,
            extraBed: input.extraBed ?? false,
            totalAmount,
            discountAmount: discount,
            cgstAmount,
            sgstAmount,
            status: "confirmed",
            paymentStatus: "pending",
            source: input.source ?? "website",
            sourceBookingId: input.sourceBookingId,
            promoCode: input.promoCode,
            specialRequests: input.specialRequests,
          },
          include: { room: true },
        });

        // ── Step 9: Update guest stats ─────────────────────────────────
        // Recompute rather than increment, so the totals stay right no matter
        // how the guest's other bookings were created or ended.
        await recalcGuestTotals(tx, guest.id);

        // ── Step 10: Audit log ─────────────────────────────────────────
        await tx.auditLog.create({
          data: {
            userId: "system",
            action: "booking_created",
            entityType: "booking",
            entityId: booking.id,
            newValue: { bookingNumber, roomId: input.roomId, totalAmount, source: input.source ?? "website" },
          },
        });

        return booking;
        // Lock released on commit
      },
      {
        // Bookings for the same room serialise behind the FOR UPDATE lock, so
        // a waiter legitimately needs longer than one transaction's worth of
        // time. `maxWait` covers acquiring the connection and opening the
        // transaction; `timeout` covers the work inside it.
        maxWait: 15000,
        timeout: 20000,
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }
    ));

    return {
      success: true,
      booking: {
        id: booking.id,
        bookingNumber: booking.bookingNumber,
        totalAmount: booking.totalAmount,
        cgstAmount: booking.cgstAmount ?? 0,
        sgstAmount: booking.sgstAmount ?? 0,
        nights: booking.nights,
        room: {
          id: booking.room.id,
          name: booking.room.name,
          pricePerNight: booking.room.pricePerNight,
        },
        guestName: booking.guestName,
        guestEmail: booking.guestEmail,
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
      },
    };
  } catch (err: unknown) {
    const error = err as Error & { code?: string; message?: string };

    if (error.message === "ROOM_NOT_AVAILABLE") {
      return {
        success: false,
        error: "Sorry, this room was just booked. Please choose another room or different dates.",
        errorCode: "ROOM_NOT_AVAILABLE",
      };
    }
    if (error.message === "BLOCKED_DATE") {
      return {
        success: false,
        error: "Selected dates are not available for booking.",
        errorCode: "BLOCKED_DATE",
      };
    }
    // Layer 1 DB exclusion constraint violation (P2002 / exclusion_violation)
    if (error.code === "P2002" || (error.message && error.message.includes("no_overlapping_bookings"))) {
      return {
        success: false,
        error: "This room was just booked by someone else. Please choose another room.",
        errorCode: "ROOM_NOT_AVAILABLE",
      };
    }

    // Contention that survived every retry. The booking definitively did not
    // happen, so say so plainly rather than leaving the guest unsure whether
    // they have a room — and never imply they should pay again.
    if (error.code && TRANSIENT_TX_CODES.has(error.code)) {
      console.error("[booking-service] createBooking exhausted retries:", error.code, error.message);
      return {
        success: false,
        error: "We are handling a lot of bookings right now and could not complete yours. Nothing was charged — please try again in a moment.",
        errorCode: "ROOM_NOT_AVAILABLE",
      };
    }

    console.error("[booking-service] createBooking failed:", error);
    return { success: false, error: "Something went wrong. Please try again.", errorCode: "UNKNOWN" };
  }
}

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

/**
 * Recompute a guest's `totalStays` / `totalRevenue` from their actual bookings.
 *
 * These columns exist so the guest list can sort on them, but they used to be
 * maintained by a lone `increment` at booking creation: nothing decremented on
 * cancellation, and any booking that arrived another way (seed, OTA import,
 * walk-in) never touched them. The guest page ended up showing "Total Stays 2"
 * directly beside "Bookings 23".
 *
 * Recomputing is cheap at this scale and self-heals whatever drifted. Cancelled
 * and no-show bookings are excluded — they are not stays and never earned money.
 */
export async function recalcGuestTotals(
  db: Prisma.TransactionClient | typeof prisma,
  guestId: string | null | undefined
): Promise<void> {
  if (!guestId) return;
  const agg = await db.booking.aggregate({
    where: { guestId, status: { notIn: ["cancelled", "no_show"] } },
    _count: { _all: true },
    _sum: { totalAmount: true },
  });
  await db.guest.update({
    where: { id: guestId },
    data: {
      totalStays: agg._count._all,
      totalRevenue: agg._sum.totalAmount ?? 0,
    },
  });
}

/**
 * Clear any room still pointing at one of these bookings.
 *
 * `roomStatus.currentBookingId` is only ever cleared on check-out, so a booking
 * that ends any other way — no-show, cancellation — leaves the room holding a
 * dead reference. The room board then keeps rendering that guest's name and
 * check-out date, and the room sits on `due_checkin` indefinitely.
 */
export async function releaseRoomsHolding(bookingIds: string[]): Promise<number> {
  if (bookingIds.length === 0) return 0;
  const { count } = await prisma.roomStatus.updateMany({
    where: { currentBookingId: { in: bookingIds } },
    data: {
      occupancy: "vacant",
      currentBookingId: null,
      currentGuestId: null,
    },
  });
  return count;
}

// ─────────────────────────────────────────────
// NIGHT AUDIT (run at midnight daily via cron)
// Marks no-shows, flags due check-outs and arrivals.
// ─────────────────────────────────────────────

export async function runNightAudit() {
  // Calendar days against DATE columns — see lib/dates.ts. Getting this wrong
  // no-shows the wrong day's arrivals, which is not recoverable from the UI.
  const today = todayDate();
  const yesterday = addDays(today, -1);

  // Mark no-shows: confirmed bookings where check-in was yesterday and never checked in
  const missed = await prisma.booking.findMany({
    where: { checkIn: yesterday, status: "confirmed", actualCheckin: null },
    select: { id: true, guestId: true },
  });
  const noShows = await prisma.booking.updateMany({
    where: { id: { in: missed.map((b) => b.id) } },
    data: { status: "no_show" },
  });
  await releaseRoomsHolding(missed.map((b) => b.id));
  // A no-show is not a stay, so the guest's totals have to come back down.
  for (const guestId of new Set(missed.map((b) => b.guestId))) {
    await recalcGuestTotals(prisma, guestId);
  }

  // Flag due check-outs
  const dueCheckouts = await prisma.booking.findMany({
    where: { checkOut: today, status: "checked_in" },
    include: { room: true },
  });
  for (const b of dueCheckouts) {
    await prisma.roomStatus.upsert({
      where: { roomId: b.roomId },
      create: { roomId: b.roomId, occupancy: "due_checkout" },
      update: { occupancy: "due_checkout" },
    });
  }

  // Flag today's arrivals
  const arrivals = await prisma.booking.findMany({
    where: { checkIn: today, status: "confirmed" },
  });
  for (const b of arrivals) {
    await prisma.roomStatus.upsert({
      where: { roomId: b.roomId },
      create: { roomId: b.roomId, occupancy: "due_checkin" },
      update: { occupancy: "due_checkin" },
    });
  }

  return { noShows: noShows.count, dueCheckouts: dueCheckouts.length, arrivals: arrivals.length };
}
