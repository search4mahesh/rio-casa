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
import { today as todayDate, addDays, toDayString } from "@/lib/dates";
import { fetchOrderPaymentState } from "@/lib/razorpay";
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
//
// Bookings for one room run strictly one at a time, so the wait for the Nth
// guest in the queue is N × however long the lock is held. That makes the
// length of the critical section — not the length of the request — the number
// worth optimising. It used to be ten round trips: rate plan, promo, GST,
// guest upsert, a COUNT for the booking number, the insert, a guest-totals
// recalculation and an audit row, all with the room locked. Twelve concurrent
// bookings for one room took ~22s.
//
// Only three things actually need the lock: taking it, re-checking
// availability under it, and inserting the row. Everything else now happens
// either before the transaction, before the FOR UPDATE, or after the commit —
// see the comments at each step for which and why.
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

/** Postgres SQLSTATEs that mean "this transaction lost a race, run it again". */
const TRANSIENT_SQLSTATES = new Set([
  "40001", // serialization_failure
  "40P01", // deadlock_detected
]);

/**
 * One serialization failure reaches us in three different shapes, depending on
 * which call inside the transaction lost the race:
 *
 *   - a Prisma model call  → `PrismaClientKnownRequestError` code `P2034`
 *   - a `$queryRaw`        → `P2010`, SQLSTATE in `meta.code`
 *   - the driver adapter   → `DriverAdapterError`, SQLSTATE in
 *                            `cause.originalCode`, no `code` at all
 *
 * All three are the same event and all three must be retried, so this walks the
 * cause chain rather than trusting any single field. Matching only `P2034` is
 * how losers of a race reached guests as "Something went wrong": the room lock
 * and the availability re-check are raw, and the guest upsert throws the third
 * shape. Deterministic outcomes are filtered out by the caller before this runs.
 */
function isTransientTxError(err: unknown): boolean {
  type ErrLike = {
    code?: unknown; kind?: unknown; originalCode?: unknown;
    meta?: { code?: unknown }; message?: unknown; cause?: unknown;
  };

  for (let e = err as ErrLike | undefined, depth = 0; e && depth < 5; e = e.cause as ErrLike, depth++) {
    if (typeof e.code === "string" && TRANSIENT_TX_CODES.has(e.code)) return true;
    if (typeof e.meta?.code === "string" && TRANSIENT_SQLSTATES.has(e.meta.code)) return true;
    if (typeof e.originalCode === "string" && TRANSIENT_SQLSTATES.has(e.originalCode)) return true;
    if (e.kind === "TransactionWriteConflict") return true;
    if (
      typeof e.message === "string" &&
      (e.message.includes("could not serialize access") ||
        e.message.includes("write conflict or a deadlock"))
    ) {
      return true;
    }
  }
  return false;
}

export async function withSerializableRetry<T>(run: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await run();
    } catch (err) {
      const message = (err as Error).message ?? "";
      if (message === "ROOM_NOT_AVAILABLE" || message === "BLOCKED_DATE") throw err;
      if (!isTransientTxError(err)) throw err;

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

// ─────────────────────────────────────────────
// PRICING
//
// One implementation, used by the website and by the front desk. There were
// two: the walk-in route priced off `room.baseRate` with no rate plan, no
// weekend markup and no extra bed, while the website used the rate plan for all
// three. They agreed only because no rate plan existed — the first one a
// manager created from /admin/setup would have made walk-ins quietly cheaper
// than the same room booked online.
//
// Split in two because the promo claim sits between the halves: the discount a
// code buys depends on the subtotal, and claiming it is a write that must not
// happen until the subtotal is known.
// ─────────────────────────────────────────────

/** The room fields pricing actually reads. */
export type PricedRoom = { roomType: string; pricePerNight: number };

export interface StayQuote {
  nights: number;
  /** Nightly rate before weekend markup and before the extra bed. */
  nightlyRate: number;
  extraBedRate: number;
  /** Rate plan applied, or null for the room's own price / an overridden rate. */
  ratePlanId: string | null;
  /** Whether a negotiated rate replaced the tariff. */
  overridden: boolean;
  /** Weekend markup and extra bed included; before any discount or tax. */
  subtotal: number;
}

export interface StayTotals {
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  totalAmount: number;
}

/**
 * Price a stay: nightly rate × nights, plus weekend markup and extra bed.
 *
 * `rateOverride` is the front desk negotiating. An overridden rate is the whole
 * nightly price — no rate plan is consulted, no weekend markup is added, and no
 * extra bed is charged on top. The desk quoted a number and that is what the
 * guest pays; anything else surprises the person who typed it.
 *
 * Without an override the fallback is `room.pricePerNight`, deliberately **not**
 * `room.baseRate`: the public site displays `pricePerNight`, so pricing off the
 * other column could charge a guest more than the page quoted them.
 */
export async function quoteStay(args: {
  room: PricedRoom;
  checkIn: Date;
  checkOut: Date;
  extraBed?: boolean;
  rateOverride?: number | null;
}): Promise<StayQuote> {
  const { room, checkIn, checkOut, extraBed = false, rateOverride = null } = args;

  const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

  if (rateOverride != null) {
    return {
      nights,
      nightlyRate: rateOverride,
      extraBedRate: 0,
      ratePlanId: null,
      overridden: true,
      subtotal: rateOverride * nights,
    };
  }

  const ratePlan = await prisma.ratePlan.findFirst({
    where: {
      roomType: room.roomType,
      isActive: true,
      validFrom: { lte: checkIn },
      validTo: { gte: checkOut },
    },
    orderBy: { priority: "desc" },
  });

  const nightlyRate = ratePlan ? Number(ratePlan.baseRate) : room.pricePerNight;
  // NOTE: without a rate plan an extra bed is free, on both paths. That is
  // existing behaviour carried over, not a decision made here — see the pricing
  // notes in CLAUDE.md before changing what a bed costs.
  const extraBedRate = extraBed && ratePlan ? Number(ratePlan.extraBedRate) : 0;

  // Weekend markup (Fri + Sat). Walk the stay in UTC — these are calendar days,
  // and `setDate`/`getDay` would ask the server's timezone which day it is.
  // See lib/dates.ts.
  let subtotal = 0;
  for (let i = 0; i < nights; i++) {
    const night = addDays(checkIn, i).getUTCDay();
    let rate = nightlyRate + extraBedRate;
    if (ratePlan && (night === 5 || night === 6)) {
      rate *= 1 + Number(ratePlan.weekendMarkup) / 100;
    }
    subtotal += rate;
  }

  return {
    nights, nightlyRate, extraBedRate,
    ratePlanId: ratePlan?.id ?? null, overridden: false, subtotal,
  };
}

/**
 * GST on accommodation, applied to the discounted amount.
 *
 * 12% (CGST 6% + SGST 6%) if the average nightly rate is ≤ ₹7,500,
 * 18% (CGST 9% + SGST 9%) above it.
 */
export function applyGst(subtotal: number, discount: number, nights: number): StayTotals {
  // Floored, so a discount worth more than the stay zeroes the bill rather than
  // inverting it. `claimPromo` already clamps what it hands back, but this is
  // the function every booking path funnels through and the one whose output
  // becomes a Razorpay order amount — it should not be able to return a
  // negative total no matter who calls it.
  const taxableAmount = Math.max(0, subtotal - discount);
  const avgNightly = taxableAmount / nights;
  const gstRate = avgNightly <= 7500 ? 6 : 9; // each component (CGST + SGST)
  const cgstAmount = Math.round(taxableAmount * gstRate) / 100;
  const sgstAmount = Math.round(taxableAmount * gstRate) / 100;
  return {
    taxableAmount, cgstAmount, sgstAmount,
    totalAmount: taxableAmount + cgstAmount + sgstAmount,
  };
}

/**
 * Allocate the next `BK-YYYYMMDD-NNN` for a check-in day.
 *
 * One statement, atomic, and deliberately outside the booking transaction. It
 * replaces a `COUNT(*)` that was both wrong and expensive: the prefix came from
 * the check-in day while the count window came from `created_at`, so every
 * advance booking for a date computed `-001`, and the second one died on the
 * unique index — reported to the guest as "this room was just booked". A COUNT
 * over a predicate also takes a predicate lock under SERIALIZABLE, which let
 * bookings for unrelated rooms abort one another.
 *
 * A booking that then fails burns its number. Gaps are fine; duplicates are not.
 */
export async function nextBookingNumber(day: Date): Promise<string> {
  return nextDailyNumber("booking", "BK", day, 3);
}

/**
 * Allocate the next `<PREFIX>-YYYYMMDD-NNN` for a day, atomically.
 *
 * One statement against `daily_counters`, which is the whole point: checking
 * what the last number was and claiming the next one cannot be separated, so
 * two writers on the same day cannot compute the same suffix. The alternative
 * — `COUNT(*)` over rows whose number starts with the prefix — loses that race
 * and the loser dies on a unique index, which is what both the booking route
 * and the laundry dispatch route used to do.
 *
 * `scope` keeps each document type's sequence independent, so a laundry batch
 * never consumes a booking number.
 *
 * @param pad digits in the suffix — bookings use 3 (`-001`), laundry 2 (`-01`),
 *            matching the numbers each already had in circulation.
 */
export async function nextDailyNumber(
  scope: string,
  prefix: string,
  day: Date,
  pad = 3
): Promise<string> {
  const dayStr = toDayString(day);
  const [row] = await prisma.$queryRaw<Array<{ last_seq: number }>>`
    INSERT INTO daily_counters (scope, day, last_seq)
    VALUES (${scope}, ${dayStr}::date, 1)
    ON CONFLICT (scope, day) DO UPDATE SET last_seq = daily_counters.last_seq + 1
    RETURNING last_seq
  `;
  return `${prefix}-${dayStr.replace(/-/g, "")}-${String(row.last_seq).padStart(pad, "0")}`;
}

/**
 * Reserve one use of a promo code and return the discount it buys.
 *
 * The usage cap lives in the UPDATE's own WHERE clause, so checking it and
 * consuming it are one indivisible statement — no promo can be redeemed past
 * its limit even without an enclosing transaction. That matters because this
 * deliberately runs outside the booking transaction: a shared counter row
 * touched under SERIALIZABLE is contention between bookings that otherwise have
 * nothing to do with each other, including bookings for different rooms.
 *
 * A claim that is never spent is handed back by `releasePromoClaim`.
 */
async function claimPromo(
  code: string,
  checkIn: Date,
  nights: number,
  subtotal: number
): Promise<{ id: string; discount: number } | null> {
  const day = toDayString(checkIn);
  const rows = await prisma.$queryRaw<
    Array<{ id: string; discount_type: string; discount_value: string; max_discount: string | null }>
  >`
    UPDATE promotions
       SET used_count = used_count + 1
     WHERE code       = ${code}
       AND is_active  = true
       AND valid_from <= ${day}::date
       AND valid_to   >= ${day}::date
       AND min_nights <= ${nights}
       AND min_amount <= ${subtotal}
       AND (usage_limit IS NULL OR used_count < usage_limit)
    RETURNING id, discount_type, discount_value, max_discount
  `;

  const promo = rows[0];
  if (!promo) return null;

  const value = Number(promo.discount_value);
  // `Number(null)` is 0, which would wipe out every percentage discount that
  // has no cap set.
  const cap = promo.max_discount === null ? Infinity : Number(promo.max_discount);
  const raw =
    promo.discount_type === "percentage" ? Math.min(subtotal * (value / 100), cap) : value;

  // A flat code can be worth more than the stay it is applied to — FLAT2000
  // against a ₹1,800 subtotal. Uncapped, that made `taxableAmount` negative in
  // `applyGst`, which then picked the 12% slab off a negative average and
  // returned a negative total straight to Razorpay. A discount can zero a
  // booking out; it cannot pay the guest.
  const discount = Math.min(raw, subtotal);

  return { id: promo.id, discount };
}

/** Hand a promo use back after a booking that claimed it did not commit. */
async function releasePromoClaim(id: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE promotions SET used_count = used_count - 1 WHERE id = ${id} AND used_count > 0
  `;
}

/** The parts of a booking that identify the person staying. */
export type GuestIdentity = Pick<BookingInput, "guestName" | "guestEmail" | "guestPhone">;

/**
 * Find the guest behind this booking, creating a directory entry if new.
 *
 * Must run inside the booking transaction: SERIALIZABLE is what stops two
 * simultaneous bookings from one phone number creating two directory rows.
 * Run it *before* the room lock — it needs the isolation, not the room.
 */
export async function resolveGuest(
  tx: Prisma.TransactionClient,
  who: GuestIdentity
): Promise<string> {
  const nameParts = who.guestName.trim().split(/\s+/);
  const firstName = nameParts[0];
  const lastName = nameParts.slice(1).join(" ") || "-";

  let guest = await tx.guest.findFirst({ where: { phone: who.guestPhone }, select: { id: true } });
  if (!guest && who.guestEmail) {
    guest = await tx.guest.findFirst({ where: { email: who.guestEmail }, select: { id: true } });
  }
  if (!guest) {
    guest = await tx.guest.create({
      data: { firstName, lastName, email: who.guestEmail, phone: who.guestPhone },
      select: { id: true },
    });
  }
  return guest.id;
}

/** Thrown by `guardRoomAvailability`; carries the booking already holding the room. */
export class RoomNotAvailableError extends Error {
  constructor(readonly conflictingBooking: string) {
    // The message is the sentinel the retry filter and the error mapping match
    // on — a serialization retry must not fire for a deterministic answer.
    super("ROOM_NOT_AVAILABLE");
    this.name = "RoomNotAvailableError";
  }
}

/** Options every booking transaction shares. See the retry notes above. */
export const BOOKING_TX_OPTIONS = {
  // Bookings for the same room serialise behind the FOR UPDATE lock, so a
  // waiter legitimately needs longer than one transaction's worth of time.
  // `maxWait` covers acquiring the connection and opening the transaction;
  // `timeout` covers the work inside it.
  maxWait: 15000,
  timeout: 20000,
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
} as const;

/**
 * Take the room lock and confirm the stay is still bookable under it.
 *
 * **This is the critical section.** Every booking path must go through it, and
 * whatever the caller does after it should be short — see "Keep the critical
 * section short" in CLAUDE.md. It exists as one function because the walk-in
 * route used to hand-roll its own check: no lock, no blocked-date test, and a
 * conflict predicate that disagreed with this one about failed payments, so a
 * room the calendar showed as free could not be booked at the front desk.
 *
 * Throws `RoomNotAvailableError` or `Error("BLOCKED_DATE")`. Both are
 * deterministic and must never be retried.
 */
export async function guardRoomAvailability(
  tx: Prisma.TransactionClient,
  roomId: string,
  checkIn: Date,
  checkOut: Date
): Promise<void> {
  // Any other booking for this room blocks here until we commit.
  await tx.$queryRaw`SELECT id FROM rooms WHERE id = ${roomId} FOR UPDATE`;

  // One round trip for both halves. The predicate mirrors the
  // `no_overlapping_bookings` exclusion constraint in
  // prisma/migrations/1_double_booking_guard. Bounds are bound as YYYY-MM-DD
  // and cast to `date` so the comparison cannot be shifted by the server's
  // timezone — these are DATE columns.
  const checkInDay = toDayString(checkIn);
  const checkOutDay = toDayString(checkOut);
  const [guard] = await tx.$queryRaw<Array<{ conflict: string | null; blocked: boolean }>>`
    SELECT
      (SELECT b.booking_number
         FROM bookings b
        WHERE b.room_id        = ${roomId}
          AND b.status         NOT IN ('cancelled', 'no_show')
          AND b.payment_status <> 'failed'
          AND b.check_in       < ${checkOutDay}::date
          AND b.check_out      > ${checkInDay}::date
        LIMIT 1) AS conflict,
      EXISTS (SELECT 1
                FROM blocked_dates d
               WHERE (d.room_id = ${roomId} OR d.room_id IS NULL)
                 AND d.block_date >= ${checkInDay}::date
                 AND d.block_date <  ${checkOutDay}::date) AS blocked
  `;
  if (guard.conflict) throw new RoomNotAvailableError(guard.conflict);
  if (guard.blocked) throw new Error("BLOCKED_DATE");
}

export async function createBooking(input: BookingInput): Promise<BookingResult> {
  if (input.checkIn >= input.checkOut) {
    return { success: false, error: "Check-out must be after check-in", errorCode: "INVALID_DATES" };
  }

  if (input.checkIn < todayDate()) {
    return { success: false, error: "Check-in date cannot be in the past", errorCode: "INVALID_DATES" };
  }

  // Released again if the booking does not commit — see the catch below.
  let unspentPromoClaim: string | null = null;

  try {
    // ══ Before the transaction ════════════════════════════════════════
    // Pricing is a pure function of the room, the rate plan and the dates.
    // None of it can be invalidated by a competing booking, so none of it
    // needs the room lock. Kept sequential on purpose: fanning these out with
    // Promise.all would take two pool connections per in-flight request, and
    // starving the pool is what made contention surface as P2028 in the first
    // place.

    // Release any abandoned checkout still holding *this* room before deciding
    // whether it is free. Scoped to one room because that is the only hold that
    // can affect this booking, and the sweep costs a Razorpay round trip per
    // candidate — usually there are none. Non-fatal: a sweep that fails leaves
    // the room held, which is the status quo, not a reason to refuse a booking.
    await expireStalePaymentHolds({ roomId: input.roomId }).catch((err) =>
      console.error("[booking-service] stale-hold sweep failed:", err)
    );

    const room = await prisma.room.findUniqueOrThrow({ where: { id: input.roomId } });

    const { nights, subtotal } = await quoteStay({
      room,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      extraBed: input.extraBed,
    });

    // Promo code — claimed up front, because the claim is what enforces the
    // usage cap and it must not be repeated if the transaction below retries.
    const claim = input.promoCode
      ? await claimPromo(input.promoCode, input.checkIn, nights, subtotal)
      : null;
    const discount = claim?.discount ?? 0;
    unspentPromoClaim = claim?.id ?? null;

    const { cgstAmount, sgstAmount, totalAmount } = applyGst(subtotal, discount, nights);

    const bookingNumber = await nextBookingNumber(input.checkIn);

    const booking = await withSerializableRetry(() => prisma.$transaction(
      async (tx) => {
        // ── Inside the transaction, before the lock ────────────────────
        // The guest lookup needs the transaction's isolation — two
        // simultaneous bookings from one phone number must not each create a
        // directory entry, and SERIALIZABLE is what stops that — but it does
        // not need the *room*, so it runs before the lock is taken. Time spent
        // here is not time the next guest for this room spends waiting.
        const guestId = await resolveGuest(tx, input);

        // ══ Critical section begins ═══════════════════════════════════
        await guardRoomAvailability(tx, input.roomId, input.checkIn, input.checkOut);

        return await tx.booking.create({
          data: {
            bookingNumber,
            guestId,
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
        // ══ Critical section ends — lock released on commit ═══════════
      },
      BOOKING_TX_OPTIONS
    ));

    // The promo was spent on a booking that exists. Nothing to hand back.
    unspentPromoClaim = null;

    // ══ After the commit ══════════════════════════════════════════════
    // Bookkeeping, not booking. Neither of these can change whether the room
    // is held, and both used to run with the lock still down. If one fails the
    // booking still stands, which is the right trade: guest totals are derived
    // state that `prisma/repair-data.ts` reports and repairs, and no audit row
    // is worth voiding a stay the guest is about to pay for.
    try {
      await recalcGuestTotals(prisma, booking.guestId);
      await prisma.auditLog.create({
        data: {
          userId: "system",
          action: "booking_created",
          entityType: "booking",
          entityId: booking.id,
          newValue: { bookingNumber, roomId: input.roomId, totalAmount, source: input.source ?? "website" },
        },
      });
    } catch (err) {
      console.error(`[booking-service] post-commit bookkeeping failed for ${bookingNumber}:`, err);
    }

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

    // The promo was consumed before we knew the room was still free, so a
    // booking that never committed has to give the use back — otherwise a code
    // capped at 50 redemptions is burnt down by guests who lost a race.
    if (unspentPromoClaim) {
      await releasePromoClaim(unspentPromoClaim).catch((e) =>
        console.error("[booking-service] could not release promo claim:", e)
      );
    }

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
    if (isTransientTxError(error)) {
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
// STALE PAYMENT HOLDS
//
// `createBooking` commits the booking before the Razorpay order exists, so
// between the commit and the guest paying there is a `confirmed` / `pending`
// row holding the room. That is intentional — it is what stops two guests
// paying for the same night — but nothing ever released it again. A guest who
// closed the checkout window took the room off the calendar until the stay was
// over: availability skips only `cancelled` / `no_show` / `failed`, the night
// audit does not look at a booking until its check-in day has arrived, and no
// cron swept for it. A December stay abandoned in August was gone for four
// months.
// ─────────────────────────────────────────────

/**
 * How long an unpaid website booking keeps its room.
 *
 * Sixty minutes covers a slow card flow with room to spare, and is longer than
 * the fifteen minutes the UPI confirmation screen promises staff will take to
 * confirm a transfer manually.
 */
export const BOOKING_HOLD_MINUTES = Number(process.env.BOOKING_HOLD_MINUTES ?? 60);

/** Cap per sweep, so one run cannot turn into an unbounded pile of API calls. */
const HOLD_SWEEP_LIMIT = 50;

export interface HoldSweepResult {
  /** Holds voided; their rooms are free again. */
  expired: number;
  /** Holds left alone — money was found, or Razorpay could not be reached. */
  retained: number;
}

/**
 * Void website bookings that were never paid for and release their rooms.
 *
 * Scoped to `source: "website"` on purpose. A walk-in sits at `pending` when
 * the desk takes payment on departure, and an OTA import is `pending` because
 * the guest paid the channel — neither is an abandoned checkout, and cancelling
 * either would delete a real stay.
 *
 * **Every candidate is checked against Razorpay before it is cancelled.** The
 * booking that reached "you have paid but we could not confirm it" is
 * indistinguishable, in our own database, from one the guest walked away from:
 * both are `pending` with no `razorpayPaymentId`, because the failure was in
 * the verify step that would have written one. Only the payment provider knows
 * the difference. Anything other than a definite "unpaid" keeps its room.
 *
 * @param roomId Restrict to one room — the on-demand path, where the only hold
 *               worth spending a round trip on is the one blocking this guest.
 */
export async function expireStalePaymentHolds(
  opts: { roomId?: string; now?: Date } = {}
): Promise<HoldSweepResult> {
  const now = opts.now ?? new Date();
  const cutoff = new Date(now.getTime() - BOOKING_HOLD_MINUTES * 60_000);

  const candidates = await prisma.booking.findMany({
    where: {
      ...(opts.roomId ? { roomId: opts.roomId } : {}),
      status: "confirmed",
      paymentStatus: "pending",
      source: "website",
      razorpayPaymentId: null,
      createdAt: { lt: cutoff },
    },
    select: { id: true, bookingNumber: true, guestId: true, razorpayOrderId: true },
    take: HOLD_SWEEP_LIMIT,
  });

  const voided: string[] = [];
  const guestIds = new Set<string>();
  let retained = 0;

  for (const booking of candidates) {
    // No order was ever created — /api/booking/create failed between the commit
    // and `createOrder`, and its own catch could not run. There is nothing for
    // the guest to have paid.
    if (booking.razorpayOrderId) {
      const state = await fetchOrderPaymentState(booking.razorpayOrderId);
      if (state !== "unpaid") {
        retained++;
        console.error(
          `[hold-sweep] ${booking.bookingNumber} is unpaid in our records but Razorpay says "${state}" ` +
            `for order ${booking.razorpayOrderId} — keeping the room and leaving it for staff to reconcile`
        );
        continue;
      }
    }

    // Compare-and-swap. The guest may have paid in the moments since the read
    // above, in which case /api/payment/verify has already moved the row off
    // `pending` and this matches nothing.
    const { count } = await prisma.booking.updateMany({
      where: { id: booking.id, status: "confirmed", paymentStatus: "pending" },
      data: {
        status: "cancelled",
        paymentStatus: "failed",
        cancelledAt: now,
        cancellationReason: `Payment not completed within ${BOOKING_HOLD_MINUTES} minutes`,
      },
    });
    if (count === 0) {
      retained++;
      continue;
    }

    voided.push(booking.id);
    if (booking.guestId) guestIds.add(booking.guestId);

    await prisma.auditLog.create({
      data: {
        userId: "system",
        action: "booking_hold_expired",
        entityType: "booking",
        entityId: booking.id,
        newValue: {
          bookingNumber: booking.bookingNumber,
          razorpayOrderId: booking.razorpayOrderId,
          heldForMinutes: BOOKING_HOLD_MINUTES,
        },
      },
    }).catch((err) => console.error("[hold-sweep] audit write failed:", err));
  }

  // A cancelled booking is not a stay, and its room is no longer spoken for.
  await releaseRoomsHolding(voided);
  for (const guestId of guestIds) {
    await recalcGuestTotals(prisma, guestId);
  }

  return { expired: voided.length, retained };
}

// ─────────────────────────────────────────────
// NIGHT AUDIT (run at midnight daily via cron)
// Marks no-shows, flags due check-outs and arrivals.
// ─────────────────────────────────────────────

export async function runNightAudit() {
  // Calendar days against DATE columns — see lib/dates.ts. Getting this wrong
  // no-shows the wrong day's arrivals, which is not recoverable from the UI.
  const today = todayDate();

  // Backstop for abandoned checkouts. The on-demand sweep in `createBooking`
  // only covers rooms someone is actively trying to book; this catches the
  // rest, so a hold cannot outlive the night it was taken by more than a day.
  const holds = await expireStalePaymentHolds().catch((err) => {
    console.error("[night-audit] stale-hold sweep failed:", err);
    return { expired: 0, retained: 0 };
  });

  // Mark no-shows: confirmed bookings whose check-in day has passed without an
  // arrival.
  //
  // `checkIn: { lt: today }`, not `checkIn: yesterday`. Matching only yesterday
  // meant a single missed run was permanent: one deploy window, or a 503 from
  // `denyIfNotCron` because CRON_SECRET was unset, and that day's missed
  // arrivals stayed `confirmed` forever — holding rooms on the calendar and
  // counting toward guest totals — because tomorrow's run only ever looks at
  // tomorrow's yesterday. This is also what /api/admin/night-audit/run has
  // always done, and the two must not disagree about what a no-show is.
  //
  // Re-running is safe: `status: "confirmed"` excludes anything already marked.
  const missed = await prisma.booking.findMany({
    where: { checkIn: { lt: today }, status: "confirmed", actualCheckin: null },
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

  return {
    noShows: noShows.count,
    dueCheckouts: dueCheckouts.length,
    arrivals: arrivals.length,
    holdsExpired: holds.expired,
    holdsRetained: holds.retained,
  };
}
