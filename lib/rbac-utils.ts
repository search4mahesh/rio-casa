// Pure RBAC utilities — no server-only imports.
// Safe to import from both client components and server code.
// See lib/rbac.ts for the server-side `forbidden()` helper.

export type Role = "owner" | "manager" | "frontdesk" | "housekeeping";

export const RANK: Record<Role, number> = {
  housekeeping: 1,
  frontdesk:    2,
  manager:      3,
  owner:        4,
};

/** True when `role` meets or exceeds the required `min` role. */
export function hasMinRole(role: string | undefined | null, min: Role): boolean {
  const have = RANK[(role ?? "") as Role] ?? 0;
  return have >= RANK[min];
}

/**
 * Minimum role required to VIEW each admin page.
 * Mirrors the API-level gates — the sidebar and RoleGuard both read from here
 * so nav visibility and page guards can never drift from each other.
 */
export const PAGE_MIN_ROLE: Record<string, Role> = {
  "/admin/dashboard":     "housekeeping",
  "/admin/housekeeping":  "housekeeping",
  "/admin/rooms":         "frontdesk",
  "/admin/calendar":      "frontdesk",
  "/admin/bookings":      "frontdesk",
  "/admin/guests":        "frontdesk",
  "/admin/blocked-dates": "frontdesk",
  "/admin/invoices":      "frontdesk",
  "/admin/night-audit":   "manager",
  "/admin/rate-plans":    "manager",
  "/admin/promos":        "manager",
  "/admin/communications":"manager",
  "/admin/reviews":       "manager",
  "/admin/shifts":        "manager",
  "/admin/expenses":      "manager",
  "/admin/reconciliation":"manager",
  "/admin/reports":       "manager",
  "/admin/settings":      "owner",
};
