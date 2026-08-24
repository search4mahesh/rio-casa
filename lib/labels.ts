// ─────────────────────────────────────────────────────────────
// Shared display labels for domain enums.
//
// These map stored values (staff.role, room.roomType) to the text
// shown to staff. They live here because the same value is rendered
// in several panels — when a label is defined per-panel the copies
// drift, which is how ROOM_TYPE_LABEL ended up knowing about
// "standard" in one place and "all" in another.
//
// Pure data, no imports — safe from both client and server.
// ─────────────────────────────────────────────────────────────

/** Staff roles — mirrors the `Role` union in lib/rbac-utils.ts. */
export const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  manager: "Manager",
  frontdesk: "Front Desk",
  housekeeping: "Housekeeping",
};

/**
 * Room types currently sold, cheapest first — see prisma/seed-rooms.ts.
 *   standard  101–104
 *   deluxe    202, 203
 *   luxury    201, 204
 *   family    105
 */
export const SELLABLE_ROOM_TYPES = ["standard", "deluxe", "luxury", "family"] as const;

/**
 * Display names for room types.
 *
 * Retired types (premium, presidential) are kept so historical bookings and
 * invoices still render a real name instead of a raw enum. Don't offer them
 * in pickers — use SELLABLE_ROOM_TYPES for that.
 */
export const ROOM_TYPE_LABEL: Record<string, string> = {
  standard: "Standard",
  deluxe: "Deluxe",
  luxury: "Luxury",
  family: "Family",
  premium: "Premium",
  presidential: "Presidential",
};

/**
 * Room types plus the "all" pseudo-value used by rate plans, which can
 * target every room type at once. Kept separate so pickers that list
 * real rooms don't accidentally offer "All Rooms" as a room type.
 */
export const ROOM_TYPE_FILTER_LABEL: Record<string, string> = {
  ...ROOM_TYPE_LABEL,
  all: "All Rooms",
};

/** Options for a rate-plan room-type picker: the sellable types plus "all". */
export const RATE_PLAN_ROOM_TYPES = ["all", ...SELLABLE_ROOM_TYPES] as const;

/**
 * Booking sources where the guest pays the *channel*, not us.
 *
 * These stay at `paymentStatus: "pending"` for their whole life — there is no
 * Razorpay payment to record, because the money reached the OTA. That is
 * deliberate (see CLAUDE.md, `expireStalePaymentHolds`, which refuses to sweep
 * them for the same reason), so anything asking "what did this month earn?"
 * has to count them. Reconciliation previously filtered on
 * `paymentStatus in (paid, cash)` alone and so dropped every OTA stay: a
 * ₹33,600 Booking.com booking vanished from August's revenue and the channel
 * disappeared from the by-source breakdown entirely (B-35).
 *
 * `pending` on a `walkin`, `phone` or `website` booking means the opposite —
 * nobody has paid yet — so those are still excluded.
 */
export const CHANNEL_PAID_SOURCES = ["booking_com", "mmt", "goibibo", "airbnb"] as const;
