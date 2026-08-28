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

// ─────────────────────────────────────────────────────────────
// Audit log
// ─────────────────────────────────────────────────────────────

/**
 * The `userId` automated and guest-driven writes carry.
 *
 * Website bookings, payment verification and the hold sweeper all audit under
 * this rather than a staff id — there is no staff member behind them. The
 * activity log defaults to hiding them: oversight is about what *people* did,
 * and six system actions per booking would bury the one a person took.
 */
export const SYSTEM_ACTOR = "system";

/** Groups actions in the activity log's filter. */
export type AuditCategory =
  | "inventory" | "booking" | "money" | "guest" | "staff" | "housekeeping" | "system";

export const AUDIT_CATEGORY_LABEL: Record<AuditCategory, string> = {
  inventory:    "Rooms & availability",
  booking:      "Bookings",
  money:        "Money",
  guest:        "Guests",
  staff:        "Staff",
  housekeeping: "Housekeeping",
  system:       "System",
};

/**
 * Every `action` string written to `audit_log`, with how to show it.
 *
 * Keep this in step with the write sites — an action missing here still
 * appears in the log, rendered as its raw value rather than hidden, because a
 * blank row in an audit trail is worse than an ugly one.
 *
 * `notable` marks the actions worth a second look: they move money, remove
 * inventory, or undo something. The activity log can filter to just these, and
 * they are the shortlist any fraud question starts from.
 */
export const AUDIT_ACTION: Record<string, { label: string; category: AuditCategory; notable?: true }> = {
  // Availability — the writes that take a room off sale.
  blocked_dates_created: { label: "Blocked dates",              category: "inventory", notable: true },
  blocked_date_removed:  { label: "Unblocked a date",           category: "inventory", notable: true },
  update_room_status:    { label: "Changed room status",        category: "inventory" },
  inventory_update:      { label: "Pushed inventory to channel", category: "inventory" },

  // Bookings.
  create_walkin_booking: { label: "Created a walk-in booking",   category: "booking", notable: true },
  cancel_booking:        { label: "Cancelled a booking",         category: "booking", notable: true },
  booking_created:       { label: "Booking created",             category: "booking" },
  check_in:              { label: "Checked a guest in",          category: "booking" },
  check_out:             { label: "Checked a guest out",         category: "booking" },
  booking_hold_expired:  { label: "Unpaid hold expired",         category: "booking" },
  booking_voided_payment_init_failed:    { label: "Booking voided — payment could not start", category: "booking" },
  booking_reinstated_after_late_payment: { label: "Reinstated after a late payment",          category: "booking" },

  // Money.
  payment_received:      { label: "Payment received",            category: "money" },
  payment_received_for_cancelled_booking: { label: "Paid for a cancelled booking — refund due", category: "money", notable: true },
  email_invoice:         { label: "Emailed an invoice",          category: "money" },

  update_guest:          { label: "Edited a guest record",       category: "guest" },
  change_password:       { label: "Changed their own password",  category: "staff" },

  laundry_dispatched:      { label: "Dispatched laundry",        category: "housekeeping" },
  laundry_returned:        { label: "Received laundry back",     category: "housekeeping" },
  laundry_batch_cancelled: { label: "Cancelled a laundry batch", category: "housekeeping", notable: true },

  night_audit_run:       { label: "Ran the night audit",         category: "system" },
};

/** Actions flagged `notable`, for the log's default filter. */
export const NOTABLE_ACTIONS = Object.entries(AUDIT_ACTION)
  .filter(([, meta]) => meta.notable)
  .map(([action]) => action);
