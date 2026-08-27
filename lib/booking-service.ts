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
import {
  allocate,
  toCategories,
  type Allocation,
  type RoomSelection,
} from "@/lib/room-capacity";

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

/** One room in a party, and whether it carries a rollaway. */
export interface GroupRoomRequest {
  roomId: string;
  extraBed?: boolean;
}

/**
 * A party booking one or more rooms at once.
 *
 * `adults`/`children` are the whole party, not the occupants of any one room —
 * a five-person family in two rooms is `adults: 5`, and the split across rooms
 * is the front desk's business at check-in, not the guest's at checkout.
 */
export interface GroupBookingInput {
  rooms: GroupRoomRequest[];
  checkIn: Date;
  checkOut: Date;
  adults: number;
  children?: number;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  source?: "website" | "walkin" | "phone" | "booking_com" | "mmt" | "goibibo";
  promoCode?: string;
  specialRequests?: string;
  sourceBookingId?: string;
}

export interface GroupBookingResult {
  success: boolean;
  group?: {
    id: string;
    groupNumber: string;
    totalAmount: number;
    discountAmount: number;
    nights: number;
    guestName: string;
    guestEmail: string;
    checkIn: Date;
    checkOut: Date;
    bookings: Array<{
      id: string;
      bookingNumber: string;
      totalAmount: number;
      discountAmount: number;
      cgstAmount: number;
      sgstAmount: number;
      extraBed: boolean;
      room: { id: string; name: string; pricePerNight: number };
    }>;
  };
  error?: string;
  errorCode?: "ROOM_NOT_AVAILABLE" | "INVALID_DATES" | "BLOCKED_DATE" | "PROMO_INVALID" | "UNKNOWN";
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
    discountAmount: number;
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
  errorCode?: "ROOM_NOT_AVAILABLE" | "INVALID_DATES" | "BLOCKED_DATE" | "PROMO_INVALID" | "UNKNOWN";
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
  // Same two guards `checkAvailability` applies to a single room. Without them
  // the room *list* answered "available" for a range `checkAvailability` and
  // `createBooking` both refuse, so /rooms offered stays nobody could book
  // (B-42). The list and the single-room check must agree.
  if (checkIn >= checkOut) return [];
  if (checkIn < todayDate()) return [];

  const allRooms = await prisma.room.findMany({
    // Capacity counts the rollaway. `maxGuests` is the beds already in the
    // room; a room that takes an extra bed sleeps one more, and filtering on
    // `maxGuests` alone is why a party of five was told a property with five
    // empty rooms was full (B-57).
    where: {
      isActive: true,
      OR: [
        { maxGuests: { gte: minGuests } },
        { extraBed: true, maxGuests: { gte: minGuests - 1 } },
      ],
    },
    // Ordered on purpose. The wizard shows one card per room type and keeps
    // the first of each, so without this the room a guest is offered — and its
    // price — was whatever Postgres happened to return first. Cheapest first
    // matches how `getRoomCategories` prices a category, so /rooms and the
    // wizard cannot quote different numbers for the same type (B-55).
    orderBy: [{ pricePerNight: "asc" }, { roomNumber: "asc" }],
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
export type PricedRoom = {
  roomType: string;
  pricePerNight: number;
  /** Whether this room can take a rollaway at all. */
  extraBed?: boolean;
  /** Per night, used when no rate plan covers the stay. Prisma Decimal or number. */
  extraBedRate?: number | { toString(): string };
};

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

  // `RATE_PLAN_ROOM_TYPES` in lib/labels.ts deliberately includes "all"
  // alongside the four real room types — the admin form's "All Rooms" option
  // saves exactly that string. Matching only `room.roomType` here meant an
  // "all" plan could never be found by the one place that prices a stay: it
  // saved without error and silently never applied to anything. If both a
  // specific-type plan and an "all" plan cover the same dates, `priority`
  // decides which wins — same as when two plans of the same type overlap.
  const ratePlan = await prisma.ratePlan.findFirst({
    where: {
      roomType: { in: [room.roomType, "all"] },
      isActive: true,
      validFrom: { lte: checkIn },
      validTo: { gte: checkOut },
    },
    orderBy: { priority: "desc" },
  });

  const nightlyRate = ratePlan ? Number(ratePlan.baseRate) : room.pricePerNight;

  // What the rollaway costs. The room carries the tariff so a property with no
  // rate plan still charges for it — reading the rate only from a rate plan is
  // how every extra bed was billed at ₹0 (B-57). A plan may override it, but
  // only by naming a non-zero figure: `RatePlan.extraBedRate` defaults to 0, so
  // treating 0 as "free" would mean the first plan a manager created silently
  // gave the beds away again. A genuinely free bed is a promo, not a tariff.
  const roomBedRate = room.extraBed === false ? 0 : Number(room.extraBedRate ?? 0);
  const planBedRate = ratePlan ? Number(ratePlan.extraBedRate) : 0;
  const extraBedRate = extraBed ? (planBedRate > 0 ? planBedRate : roomBedRate) : 0;

  // Weekend markup (Fri + Sat). Walk the stay in UTC — these are calendar days,
  // and `setDate`/`getDay` would ask the server's timezone which day it is.
  // See lib/dates.ts.
  //
  // The markup lifts the room rate only. An extra bed is a flat add-on — a
  // mattress, linen and a breakfast cover — and none of that costs more on a
  // Saturday. (The markup used to multiply the combined rate; it never showed,
  // because the bed was always zero.)
  let subtotal = 0;
  for (let i = 0; i < nights; i++) {
    const night = addDays(checkIn, i).getUTCDay();
    let rate = nightlyRate;
    if (ratePlan && (night === 5 || night === 6)) {
      rate *= 1 + Number(ratePlan.weekendMarkup) / 100;
    }
    subtotal += rate + extraBedRate;
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

/** Shape shared by `claimPromo`'s UPDATE...RETURNING and `previewPromo`'s SELECT. */
type PromoRow = { discount_type: string; discount_value: string; max_discount: string | null };

function computeDiscount(promo: PromoRow, subtotal: number): number {
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
  return Math.min(raw, subtotal);
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
  rawCode: string,
  checkIn: Date,
  nights: number,
  subtotal: number
): Promise<{ id: string; discount: number } | null> {
  // Trimmed here, and in `previewPromo`, so the two cannot disagree about
  // which string they are matching. They did: the preview route trimmed and
  // this did not, so " SUMMER20 " — a paste, or a phone keyboard adding a
  // trailing space — previewed as a valid discount and then failed to claim,
  // failing the whole booking with "that promo code is no longer valid"
  // against a code the guest had just been shown working (B-43).
  const code = rawCode.trim();
  const day = toDayString(checkIn);
  const rows = await prisma.$queryRaw<Array<PromoRow & { id: string }>>`
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

  return { id: promo.id, discount: computeDiscount(promo, subtotal) };
}

/**
 * Read-only look at what a promo code would buy, for the booking wizard to
 * show a guest before they commit to anything.
 *
 * Deliberately a plain SELECT, not `claimPromo`'s UPDATE — a price preview
 * must not spend a redemption (same reason `/api/booking/quote` never takes a
 * promo code at all). The actual claim still only ever happens inside
 * `createBooking`, so the usage cap is enforced in exactly one place.
 *
 * Because this can go stale between preview and submit (the code could be
 * exhausted by someone else in between), `createBooking` fails the whole
 * attempt if a submitted `promoCode` cannot actually be claimed — it never
 * silently falls back to full price. Otherwise a guest could approve a
 * discounted total here and get charged more once claimPromo comes up empty.
 */
export async function previewPromo(
  rawCode: string,
  checkIn: Date,
  nights: number,
  subtotal: number
): Promise<{ valid: boolean; discount: number; reason?: string }> {
  // Trimmed to match `claimPromo` exactly — see the note there.
  const code = rawCode.trim();
  const day = toDayString(checkIn);
  const rows = await prisma.$queryRaw<
    Array<
      PromoRow & {
        valid_from: Date;
        valid_to: Date;
        min_nights: number;
        min_amount: string;
        usage_limit: number | null;
        used_count: number;
        is_active: boolean;
      }
    >
  >`
    SELECT discount_type, discount_value, max_discount,
           valid_from, valid_to, min_nights, min_amount, usage_limit, used_count, is_active
      FROM promotions
     WHERE code = ${code}
     LIMIT 1
  `;

  const promo = rows[0];
  if (!promo || !promo.is_active) return { valid: false, discount: 0, reason: "Invalid promo code" };
  if (toDayString(promo.valid_from) > day || toDayString(promo.valid_to) < day) {
    return { valid: false, discount: 0, reason: "This code is not valid for these dates" };
  }
  if (promo.min_nights > nights) {
    return { valid: false, discount: 0, reason: `Minimum stay of ${promo.min_nights} nights required` };
  }
  if (Number(promo.min_amount) > subtotal) {
    return { valid: false, discount: 0, reason: "Booking amount is below this code's minimum" };
  }
  if (promo.usage_limit !== null && promo.used_count >= promo.usage_limit) {
    return { valid: false, discount: 0, reason: "This code has been fully redeemed" };
  }

  return { valid: true, discount: computeDiscount(promo, subtotal) };
}

/** Hand a promo use back after a booking that claimed it did not commit. */
async function releasePromoClaim(id: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE promotions SET used_count = used_count - 1 WHERE id = ${id} AND used_count > 0
  `;
}

/**
 * Same release, keyed by code instead of id — for callers outside
 * `createBooking` that only ever see the code, never the promo row's id.
 *
 * `/api/booking/create` needs this: the booking (and its promo claim) has
 * already committed by the time a Razorpay order-creation failure forces it
 * to void the booking. Without handing the claim back there too, a code with
 * a usage cap loses one redemption to every guest whose payment never even
 * started — the same leak `unspentPromoClaim` exists to close inside
 * `createBooking` itself, just on the other side of that boundary.
 */
export async function releasePromoClaimByCode(rawCode: string): Promise<void> {
  // Trimmed like `claimPromo`, or a code that was claimed as "SUMMER20" would
  // not be found when handed back under " SUMMER20 " and the redemption leaks.
  const code = rawCode.trim();
  await prisma.$executeRaw`
    UPDATE promotions SET used_count = used_count - 1 WHERE code = ${code} AND used_count > 0
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
  return guardRoomsAvailability(tx, [roomId], checkIn, checkOut);
}

/**
 * The same guard for a party taking several rooms at once.
 *
 * **Lock order is the whole point.** Two groups that overlap on rooms — one
 * taking {101, 105}, the other {105, 101} — deadlock if each locks in the order
 * its guest happened to pick. `ORDER BY id` inside the `FOR UPDATE` gives every
 * transaction in the system one order, so the second group waits instead.
 * Postgres locks at the `LockRows` node above the sort, so the ordering is the
 * locking order and not merely the order rows are returned in.
 *
 * Still one round trip for the re-check, however many rooms: the critical
 * section grows with the party, and the Nth guest queued for any of these rooms
 * is waiting on all of it (see "Keep the critical section short" in CLAUDE.md).
 */
export async function guardRoomsAvailability(
  tx: Prisma.TransactionClient,
  roomIds: string[],
  checkIn: Date,
  checkOut: Date
): Promise<void> {
  if (roomIds.length === 0) throw new Error("NO_ROOMS_SELECTED");

  // A party must not take the same room twice — it would pass the conflict
  // re-check (nothing is committed yet) and then die on the exclusion
  // constraint at commit, reported to the guest as "something went wrong".
  const ids = [...new Set(roomIds)];
  if (ids.length !== roomIds.length) throw new Error("DUPLICATE_ROOM");

  // Any other booking for these rooms blocks here until we commit.
  await tx.$queryRaw`SELECT id FROM rooms WHERE id = ANY(${ids}::text[]) ORDER BY id FOR UPDATE`;

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
        WHERE b.room_id        = ANY(${ids}::text[])
          AND b.status         NOT IN ('cancelled', 'no_show')
          AND b.payment_status <> 'failed'
          AND b.check_in       < ${checkOutDay}::date
          AND b.check_out      > ${checkInDay}::date
        LIMIT 1) AS conflict,
      EXISTS (SELECT 1
                FROM blocked_dates d
               WHERE (d.room_id = ANY(${ids}::text[]) OR d.room_id IS NULL)
                 AND d.block_date >= ${checkInDay}::date
                 AND d.block_date <  ${checkOutDay}::date) AS blocked
  `;
  if (guard.conflict) throw new RoomNotAvailableError(guard.conflict);
  if (guard.blocked) throw new Error("BLOCKED_DATE");
}

/**
 * Turn "two standards and a family room" into the actual rooms that will be
 * booked, with the extra beds the headcount requires.
 *
 * The guest picks *categories* — they never see a door number, and the wizard
 * has no business choosing one. Beds are derived here rather than sent by the
 * client for the same reason totals are: a browser that can say "no extra bed"
 * for a party of five books a room nobody sets a bed up in, and the guest finds
 * out on arrival. See "No total is ever computed in the browser" in CLAUDE.md —
 * this is that rule applied to occupancy.
 *
 * Rooms come back in `getAvailableRooms` order (cheapest, then room number), so
 * a category's quota is filled with its cheapest rooms and the guest gets the
 * price the category advertised.
 */
export async function resolveSelection(
  checkIn: Date,
  checkOut: Date,
  selection: RoomSelection,
  guests: number
): Promise<{ rooms: GroupRoomRequest[]; allocation: Allocation } | null> {
  const free = await getAvailableRooms(checkIn, checkOut, 1);
  if (free.length === 0) return null;

  const cats = toCategories(free);
  const allocation = allocate(selection, cats, guests);
  if (allocation.totalRooms === 0) return null;

  // A type that sold out under the guest is refused, never quietly substituted.
  // `allocate` has to clamp each line to the rooms that exist, so a request for
  // three standards when two are free comes back as a perfectly valid plan for
  // two — with rollaways making up the heads, so even the capacity check passes.
  // The guest booked three keys and arrives to two (B-58). The overshoot is only
  // visible in `shortRooms`; testing what came back cannot see it.
  //
  // Reachable without a hand-made request: availability is fetched once, on
  // "Continue to Room Selection", so a guest who picks three while three are
  // free and continues after someone takes one sends `standard:3` against two.
  if (allocation.shortRooms > 0) return null;

  const rooms: GroupRoomRequest[] = [];
  for (const line of allocation.lines) {
    const ofType = free.filter((r) => r.roomType === line.roomType).slice(0, line.rooms);
    ofType.forEach((room, i) => {
      // Beds go to the first rooms of the type. Which room of a type carries
      // the rollaway is arbitrary — they are interchangeable to the guest — but
      // it must be decided once, here, so the price the guest agreed to and the
      // rooms housekeeping is told to prepare cannot disagree.
      rooms.push({ roomId: room.id, extraBed: i < line.extraBeds });
    });
  }
  return { rooms, allocation };
}

/** Round to paise. Money summed from shares must land on the group total exactly. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * What a set of rooms costs before any discount or tax.
 *
 * Shared by `/api/booking/quote` and `createGroupBooking` so the figure the
 * guest agrees to is produced by the same code that charges them. The wizard
 * used to price client-side and the server used `quoteStay` → `applyGst`; the
 * guest approved one number and Razorpay opened for another (B-02). A party
 * taking several rooms is more of that surface, not less.
 *
 * Each room is priced on its own. GST follows the *room's* nightly rate, not
 * the party's total: the slab belongs to the tariff per room per night, so a
 * family in three ₹4,500 rooms stays at 12% rather than being pushed to 18% by
 * a ₹13,500 sum.
 *
 * Returns null when a room in the request no longer exists.
 */
export async function priceRooms(
  requests: GroupRoomRequest[],
  checkIn: Date,
  checkOut: Date
): Promise<{
  nights: number;
  subtotal: number;
  lines: Array<{
    req: GroupRoomRequest;
    nights: number;
    subtotal: number;
    /** The full quote, so callers can show the nightly rate a rate plan set. */
    quote: StayQuote;
    room: { id: string; name: string; roomType: string; pricePerNight: number };
  }>;
} | null> {
  const roomIds = requests.map((r) => r.roomId);
  const rooms = await prisma.room.findMany({
    where: { id: { in: roomIds }, isActive: true },
    select: {
      id: true, name: true, roomType: true, pricePerNight: true,
      // `quoteStay` reads both. Selecting the room without them prices every
      // rollaway at ₹0 — the exact shape of the bug this feature fixed.
      extraBed: true, extraBedRate: true,
    },
  });
  if (rooms.length !== new Set(roomIds).size) return null;
  const roomById = new Map(rooms.map((r) => [r.id, r]));

  // Sequential on purpose — `Promise.all` here takes a pool connection per room
  // and starving the pool is what made contention surface as P2028.
  const lines = [];
  for (const req of requests) {
    const room = roomById.get(req.roomId)!;
    const quote = await quoteStay({ room, checkIn, checkOut, extraBed: req.extraBed });
    lines.push({
      req,
      nights: quote.nights,
      subtotal: quote.subtotal,
      quote,
      room: { id: room.id, name: room.name, roomType: room.roomType, pricePerNight: room.pricePerNight },
    });
  }

  return {
    nights: lines[0].nights,
    subtotal: round2(lines.reduce((s, l) => s + l.subtotal, 0)),
    lines,
  };
}

/**
 * Share one discount across a party's rooms, and tax each room on its own.
 *
 * Proportional to what each room costs, with the rounding remainder on the last
 * so the parts sum to the whole exactly — a group whose rows do not add up to
 * what Razorpay was charged is a reconciliation problem that surfaces months
 * later.
 *
 * GST is applied per room because the slab belongs to the tariff per room per
 * night: a family in three ₹4,500 rooms stays at 12% rather than being pushed
 * to 18% by a ₹13,500 sum.
 *
 * Shared with /api/booking/promo/preview so the discounted total a guest is
 * shown is produced by the code that charges them. The wizard showing one
 * number while the server computed another is B-02; a promo split across rooms
 * is the same trap with more arithmetic in it.
 */
export function splitDiscountAcrossRooms<T extends { subtotal: number }>(
  rooms: T[],
  discount: number,
  nights: number
): { lines: Array<T & { discount: number } & StayTotals>; total: number } {
  const subtotal = round2(rooms.reduce((s, r) => s + r.subtotal, 0));

  let allocated = 0;
  const lines = rooms.map((r, i) => {
    const share = i === rooms.length - 1
      ? round2(discount - allocated)
      // A zero subtotal would make the ratio NaN, and NaN survives every
      // comparison downstream to land in the database as the amount charged.
      : round2(subtotal > 0 ? discount * (r.subtotal / subtotal) : 0);
    allocated = round2(allocated + share);
    return { ...r, discount: share, ...applyGst(r.subtotal, share, nights) };
  });

  return { lines, total: round2(lines.reduce((s, l) => s + l.totalAmount, 0)) };
}

/**
 * Book a party into one or more rooms as a single reservation.
 *
 * This is the only implementation. `createBooking` is a one-room wrapper over
 * it, so a walk-in, an OTA import and a family taking three rooms all price,
 * lock and commit through the same code — the two booking paths that drifted
 * apart on pricing (see CLAUDE.md) started life as two functions that looked
 * alike.
 */
export async function createGroupBooking(input: GroupBookingInput): Promise<GroupBookingResult> {
  if (input.rooms.length === 0) {
    return { success: false, error: "Select at least one room", errorCode: "INVALID_DATES" };
  }
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
    // Pricing is a pure function of the rooms, the rate plan and the dates.
    // None of it can be invalidated by a competing booking, so none of it needs
    // the room lock. Kept sequential on purpose: fanning these out with
    // Promise.all would take two pool connections per in-flight request, and
    // starving the pool is what made contention surface as P2028.
    const roomIds = input.rooms.map((r) => r.roomId);
    await expireStalePaymentHolds({ roomIds }).catch((err) =>
      console.error("[booking-service] stale-hold sweep failed:", err)
    );

    const pricing = await priceRooms(input.rooms, input.checkIn, input.checkOut);
    if (!pricing) {
      return { success: false, error: "One of the selected rooms no longer exists", errorCode: "UNKNOWN" };
    }
    const { nights, lines: priced, subtotal: groupSubtotal } = pricing;

    // Promo — claimed once for the whole party, against the whole subtotal.
    // Claiming per room would spend N redemptions on one reservation, so a code
    // capped at 50 uses could be exhausted by seventeen families.
    let groupDiscount = 0;
    if (input.promoCode) {
      const claim = await claimPromo(input.promoCode, input.checkIn, nights, groupSubtotal);
      if (!claim) {
        return {
          success: false,
          error: "That promo code is no longer valid. Remove it and try again.",
          errorCode: "PROMO_INVALID",
        };
      }
      unspentPromoClaim = claim.id;
      groupDiscount = claim.discount;
    }

    const { lines, total: groupTotal } = splitDiscountAcrossRooms(priced, groupDiscount, nights);

    // One number for the party, whatever it costs in rooms. The desk and the
    // guest quote this; the child rows hang `/1`, `/2` off it so a single room
    // in the group is still identifiable on a housekeeping sheet.
    const groupNumber = await nextBookingNumber(input.checkIn);
    const bookingNumberFor = (i: number) =>
      lines.length === 1 ? groupNumber : `${groupNumber}/${i + 1}`;

    const created = await withSerializableRetry(() => prisma.$transaction(
      async (tx) => {
        // ── Inside the transaction, before the lock ────────────────────
        // The guest lookup needs the transaction's isolation — two simultaneous
        // bookings from one phone number must not each create a directory entry
        // — but it does not need the rooms, so it runs before the lock. Time
        // spent here is not time the next guest for these rooms spends waiting.
        const guestId = await resolveGuest(tx, input);

        // ══ Critical section begins ═══════════════════════════════════
        // Every room in one ordered pass, so two parties that overlap on rooms
        // queue rather than deadlock.
        await guardRoomsAvailability(tx, roomIds, input.checkIn, input.checkOut);

        const group = await tx.bookingGroup.create({
          data: {
            groupNumber,
            guestId,
            totalAmount: groupTotal,
            discountAmount: groupDiscount,
            adults: input.adults,
            children: input.children ?? 0,
            promoCode: input.promoCode?.trim(),
            source: input.source ?? "website",
          },
        });

        // `createMany` cannot return the rows, and the caller needs their ids
        // to build the confirmation. N is the number of rooms a party takes —
        // at most five in this property — so the round trips are bounded.
        const bookings = [];
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          bookings.push(await tx.booking.create({
            data: {
              bookingNumber: bookingNumberFor(i),
              groupId: group.id,
              guestId,
              guestName: input.guestName,
              guestEmail: input.guestEmail,
              guestPhone: input.guestPhone,
              roomId: line.req.roomId,
              checkIn: input.checkIn,
              checkOut: input.checkOut,
              nights,
              // Headcount lives on the group; a child row cannot say how many
              // people are in the party, only that this room is part of it.
              adults: input.adults,
              children: input.children ?? 0,
              extraBed: line.req.extraBed ?? false,
              totalAmount: line.totalAmount,
              discountAmount: line.discount,
              cgstAmount: line.cgstAmount,
              sgstAmount: line.sgstAmount,
              status: "confirmed",
              paymentStatus: "pending",
              source: input.source ?? "website",
              sourceBookingId: input.sourceBookingId,
              // Stored as claimed, so the booking and `promotions.code` agree.
              promoCode: input.promoCode?.trim(),
              specialRequests: input.specialRequests,
            },
            include: { room: true },
          }));
        }
        return { group, bookings, guestId };
        // ══ Critical section ends — lock released on commit ═══════════
      },
      BOOKING_TX_OPTIONS
    ));

    // The promo was spent on a booking that exists. Nothing to hand back.
    unspentPromoClaim = null;

    // ══ After the commit ══════════════════════════════════════════════
    // Bookkeeping, not booking. Neither of these can change whether the rooms
    // are held. If one fails the booking still stands, which is the right
    // trade: guest totals are derived state that prisma/repair-data.ts reports
    // and repairs, and no audit row is worth voiding a stay about to be paid.
    try {
      await recalcGuestTotals(prisma, created.guestId);
      await prisma.auditLog.create({
        data: {
          userId: "system",
          action: "booking_created",
          entityType: "booking_group",
          entityId: created.group.id,
          newValue: {
            groupNumber,
            rooms: created.bookings.map((b) => ({ roomId: b.roomId, bookingNumber: b.bookingNumber })),
            totalAmount: groupTotal,
            source: input.source ?? "website",
          },
        },
      });
    } catch (err) {
      console.error(`[booking-service] post-commit bookkeeping failed for ${groupNumber}:`, err);
    }

    return {
      success: true,
      group: {
        id: created.group.id,
        groupNumber,
        totalAmount: groupTotal,
        discountAmount: groupDiscount,
        nights,
        guestName: input.guestName,
        guestEmail: input.guestEmail,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        bookings: created.bookings.map((b) => ({
          id: b.id,
          bookingNumber: b.bookingNumber,
          totalAmount: b.totalAmount,
          discountAmount: b.discountAmount,
          cgstAmount: b.cgstAmount ?? 0,
          sgstAmount: b.sgstAmount ?? 0,
          extraBed: b.extraBed,
          room: { id: b.room.id, name: b.room.name, pricePerNight: b.room.pricePerNight },
        })),
      },
    };
  } catch (err: unknown) {
    const error = err as Error & { code?: string; message?: string };

    // The promo was consumed before we knew the rooms were still free, so a
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
        error: input.rooms.length > 1
          ? "One of those rooms was just booked. Please choose again or try different dates."
          : "Sorry, this room was just booked. Please choose another room or different dates.",
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
        error: "One of those rooms was just booked by someone else. Please choose again.",
        errorCode: "ROOM_NOT_AVAILABLE",
      };
    }

    // Contention that survived every retry. The booking definitively did not
    // happen, so say so plainly rather than leaving the guest unsure whether
    // they have a room — and never imply they should pay again.
    if (isTransientTxError(error)) {
      console.error("[booking-service] createGroupBooking exhausted retries:", error.code, error.message);
      return {
        success: false,
        error: "We are handling a lot of bookings right now and could not complete yours. Nothing was charged — please try again in a moment.",
        errorCode: "ROOM_NOT_AVAILABLE",
      };
    }

    console.error("[booking-service] createGroupBooking failed:", error);
    return { success: false, error: "Something went wrong. Please try again.", errorCode: "UNKNOWN" };
  }
}

/**
 * One room, one booking — the walk-in and OTA shape.
 *
 * A thin adapter over `createGroupBooking` rather than a second implementation.
 * Such a booking still gets a group of one, so nothing downstream needs an "is
 * this a group?" branch, and its `bookingNumber` stays the plain
 * `BK-YYYYMMDD-NNN` these callers have always issued.
 */
export async function createBooking(input: BookingInput): Promise<BookingResult> {
  const result = await createGroupBooking({
    rooms: [{ roomId: input.roomId, extraBed: input.extraBed }],
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    adults: input.adults,
    children: input.children,
    guestName: input.guestName,
    guestEmail: input.guestEmail,
    guestPhone: input.guestPhone,
    source: input.source,
    promoCode: input.promoCode,
    specialRequests: input.specialRequests,
    sourceBookingId: input.sourceBookingId,
  });

  if (!result.success || !result.group) {
    return { success: false, error: result.error, errorCode: result.errorCode };
  }

  const only = result.group.bookings[0];
  return {
    success: true,
    booking: {
      id: only.id,
      bookingNumber: only.bookingNumber,
      totalAmount: only.totalAmount,
      discountAmount: only.discountAmount,
      cgstAmount: only.cgstAmount,
      sgstAmount: only.sgstAmount,
      nights: result.group.nights,
      room: only.room,
      guestName: result.group.guestName,
      guestEmail: result.group.guestEmail,
      checkIn: result.group.checkIn,
      checkOut: result.group.checkOut,
    },
  };
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
  opts: { roomId?: string; roomIds?: string[]; now?: Date } = {}
): Promise<HoldSweepResult> {
  const now = opts.now ?? new Date();
  const cutoff = new Date(now.getTime() - BOOKING_HOLD_MINUTES * 60_000);

  const scopedRooms = opts.roomIds ?? (opts.roomId ? [opts.roomId] : null);

  const candidates = await prisma.booking.findMany({
    where: {
      ...(scopedRooms ? { roomId: { in: scopedRooms } } : {}),
      status: "confirmed",
      paymentStatus: "pending",
      source: "website",
      razorpayPaymentId: null,
      createdAt: { lt: cutoff },
    },
    select: { id: true, bookingNumber: true, guestId: true, razorpayOrderId: true, groupId: true },
    take: HOLD_SWEEP_LIMIT,
  });

  // A party's rooms expire together or not at all. Releasing two rooms of three
  // leaves a family holding one room against an order for all three — and the
  // scan above can see only one of them when it is scoped to the room someone
  // else is trying to book. So each candidate is widened to its whole group
  // before anything is cancelled.
  const groupIds = [...new Set(candidates.map((b) => b.groupId).filter((id): id is string => !!id))];
  const siblings = groupIds.length
    ? await prisma.booking.findMany({
        where: { groupId: { in: groupIds }, status: "confirmed", paymentStatus: "pending" },
        select: { id: true, bookingNumber: true, guestId: true, razorpayOrderId: true, groupId: true },
      })
    : [];

  // One unit per reservation: a group, or a lone booking that has none.
  const units = new Map<string, typeof candidates>();
  for (const b of [...candidates, ...siblings]) {
    const key = b.groupId ?? b.id;
    const unit = units.get(key) ?? [];
    if (!unit.some((x) => x.id === b.id)) unit.push(b);
    units.set(key, unit);
  }

  const voided: string[] = [];
  const guestIds = new Set<string>();
  let retained = 0;

  for (const unit of units.values()) {
    const lead = unit[0];

    // No order was ever created — /api/booking/create failed between the commit
    // and `createOrder`, and its own catch could not run. There is nothing for
    // the guest to have paid. Every room in a party shares one order, so one
    // question to Razorpay answers for the whole unit.
    const orderId = unit.find((b) => b.razorpayOrderId)?.razorpayOrderId ?? null;
    if (orderId) {
      const state = await fetchOrderPaymentState(orderId);
      if (state !== "unpaid") {
        retained += unit.length;
        console.error(
          `[hold-sweep] ${lead.bookingNumber} is unpaid in our records but Razorpay says "${state}" ` +
            `for order ${orderId} — keeping the room and leaving it for staff to reconcile`
        );
        continue;
      }
    }

    // Compare-and-swap, all rooms or none. The guest may have paid in the
    // moments since the read above, in which case /api/payment/verify has
    // already moved the rows off `pending`. Cancelling the siblings anyway
    // would take rooms away from a party that has just paid for them, so a
    // short count rolls the whole unit back.
    const ids = unit.map((b) => b.id);
    let cancelled = false;
    try {
      await prisma.$transaction(async (tx) => {
        const { count } = await tx.booking.updateMany({
          where: { id: { in: ids }, status: "confirmed", paymentStatus: "pending" },
          data: {
            status: "cancelled",
            paymentStatus: "failed",
            cancelledAt: now,
            cancellationReason: `Payment not completed within ${BOOKING_HOLD_MINUTES} minutes`,
          },
        });
        if (count !== ids.length) throw new Error("HOLD_RACE");
      });
      cancelled = true;
    } catch (err) {
      if ((err as Error).message !== "HOLD_RACE") throw err;
    }

    if (!cancelled) {
      retained += unit.length;
      continue;
    }

    for (const b of unit) {
      voided.push(b.id);
      if (b.guestId) guestIds.add(b.guestId);
    }

    await prisma.auditLog.create({
      data: {
        userId: "system",
        action: "booking_hold_expired",
        entityType: lead.groupId ? "booking_group" : "booking",
        entityId: lead.groupId ?? lead.id,
        newValue: {
          bookingNumbers: unit.map((b) => b.bookingNumber),
          razorpayOrderId: orderId,
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

  // Flag due check-outs.
  //
  // `checkOut: { lte: today }`, not `checkOut: today` — this is the departure
  // half of B-04, which fixed exactly this for arrivals. Matching the day
  // exactly meant a checkout the desk never pressed dropped off the list at
  // midnight and was never mentioned again: six stays sat `checked_in` up to
  // 91 days past departure, holding their rooms, and — because
  // `generateInvoice` only runs from the check-out route — with no GST invoice
  // between them (B-51).
  //
  // Nothing here closes them. An overdue checkout is a real stay that ended,
  // but the guest may equally still be in the room, and only the desk knows
  // which. This makes them visible every day until someone decides;
  // `prisma/close-overdue-checkouts.ts` is the tool for a backlog.
  const dueCheckouts = await prisma.booking.findMany({
    where: { checkOut: { lte: today }, status: "checked_in" },
    include: { room: true },
  });
  const overdueCheckouts = dueCheckouts.filter((b) => b.checkOut < today).length;
  for (const b of dueCheckouts) {
    await prisma.roomStatus.upsert({
      where: { roomId: b.roomId },
      create: { roomId: b.roomId, occupancy: "due_checkout" },
      update: { occupancy: "due_checkout" },
    });
  }

  // Flag today's arrivals.
  const arrivals = await prisma.booking.findMany({
    where: { checkIn: today, status: "confirmed" },
  });

  // `due_checkin` is a statement about *today*, so yesterday's flags are stale
  // by definition and this re-derives them rather than adding to them.
  //
  // They used to accumulate with nothing able to remove them. The upsert below
  // set `occupancy` but not `currentBookingId`, and every path that frees a
  // room keys on exactly that column — `releaseRoomsHolding` matches
  // `currentBookingId: { in: … }`, the cancel route matches
  // `currentBookingId: booking.id`, and `prisma/repair-data.ts` looks for the
  // same drift. None of them can match a NULL, so a guest who no-showed,
  // cancelled or moved their dates left the room reading "Due Check-in" for
  // good, and the flags piled up until every room claimed to expect someone.
  // `/api/admin/night-audit/run` has always written `currentBookingId` here;
  // this is the scheduled path catching up with it (B-48).
  //
  // Clearing is scoped to rooms this audit owns: `occupied` and
  // `out_of_order` are somebody else's state, and a room with a guest still
  // checked into it is never reset — a stale flag is better than hiding
  // someone who is actually in the room.
  const arrivalRoomIds = arrivals.map((b) => b.roomId);
  const occupiedRoomIds = (
    await prisma.booking.findMany({
      where: { status: "checked_in" },
      select: { roomId: true },
      distinct: ["roomId"],
    })
  ).map((b) => b.roomId);

  const staleFlags = await prisma.roomStatus.updateMany({
    where: {
      occupancy: "due_checkin",
      roomId: { notIn: [...arrivalRoomIds, ...occupiedRoomIds] },
    },
    data: { occupancy: "vacant", currentBookingId: null, currentGuestId: null },
  });

  for (const b of arrivals) {
    await prisma.roomStatus.upsert({
      where: { roomId: b.roomId },
      // `currentBookingId` is what lets this flag be cleared again later.
      create: {
        roomId: b.roomId,
        occupancy: "due_checkin",
        currentBookingId: b.id,
        currentGuestId: b.guestId ?? null,
      },
      update: {
        occupancy: "due_checkin",
        currentBookingId: b.id,
        currentGuestId: b.guestId ?? null,
      },
    });
  }

  return {
    noShows: noShows.count,
    dueCheckouts: dueCheckouts.length,
    // Broken out so "3 due today" is not silently inflated by a backlog that
    // needs a different response — see B-51.
    overdueCheckouts,
    arrivals: arrivals.length,
    staleFlagsCleared: staleFlags.count,
    holdsExpired: holds.expired,
    holdsRetained: holds.retained,
  };
}
