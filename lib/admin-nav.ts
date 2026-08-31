// Single source of truth for admin navigation.
//
// The sidebar, the hub tab bars, and RoleGuard all read from here, so nav
// visibility and access control can never drift apart. Pure data — no JSX,
// no server-only imports — safe to import from client and server alike.

import type { Role } from "./rbac-utils";

/** A tab inside a hub page, addressed as `?tab=<slug>`. */
export type NavTab = {
  slug: string;
  label: string;
  minRole: Role;
};

/** A top-level sidebar entry. `tabs` present ⇒ the page is a hub. */
export type NavItem = {
  /** Icon key — AdminSidebar maps this to an SVG. */
  icon: string;
  label: string;
  href: string;
  minRole: Role;
  tabs?: NavTab[];
};

export const NAV: NavItem[] = [
  {
    icon: "home",
    label: "Today",
    href: "/admin/dashboard",
    minRole: "housekeeping",
  },
  {
    icon: "calendar",
    label: "Calendar",
    href: "/admin/calendar",
    minRole: "frontdesk",
    tabs: [
      { slug: "month",   label: "Month",         minRole: "frontdesk" },
      { slug: "14day",   label: "Next 14 Days",  minRole: "frontdesk" },
      // Front desk on purpose, and deliberately *not* matching the API gate.
      // GET /api/admin/blocked-dates is frontdesk because the desk has to know
      // a room is closed before promising it on the phone; POST and DELETE are
      // manager, because blocking is the only write that removes inventory
      // without a booking to account for it. The panel hides its own write
      // controls via `canManage`. Raising this to manager would hide the list
      // from the people who need to read it and fix nothing.
      { slug: "blocked", label: "Blocked Dates", minRole: "frontdesk" },
    ],
  },
  {
    icon: "clipboard",
    label: "Bookings",
    href: "/admin/bookings",
    minRole: "frontdesk",
  },
  {
    icon: "users",
    label: "Guests",
    href: "/admin/guests",
    minRole: "frontdesk",
    tabs: [
      { slug: "list",      label: "Guest List", minRole: "frontdesk" },
      // Inbound contact-form submissions. Front desk rather than manager on
      // purpose: an inquiry is a prospective guest asking whether a room is
      // free, and gating it higher would keep leads away from the people who
      // answer the phone (B-61).
      { slug: "inquiries", label: "Inquiries",  minRole: "frontdesk" },
    ],
  },
  {
    icon: "sparkle",
    label: "Housekeeping",
    href: "/admin/housekeeping",
    minRole: "housekeeping",
    tabs: [
      { slug: "rooms",   label: "Room Tasks", minRole: "housekeeping" },
      { slug: "laundry", label: "Laundry",    minRole: "housekeeping" },
    ],
  },
  {
    icon: "rupee",
    label: "Money",
    href: "/admin/money",
    minRole: "frontdesk",
    tabs: [
      { slug: "invoices",   label: "Invoices",       minRole: "frontdesk" },
      { slug: "expenses",   label: "Expenses",       minRole: "manager" },
      { slug: "reconcile",  label: "Reconciliation", minRole: "manager" },
      { slug: "reports",    label: "Reports",        minRole: "manager" },
      { slug: "nightaudit", label: "Night Audit",    minRole: "manager" },
    ],
  },
  {
    icon: "cog",
    label: "Setup",
    href: "/admin/setup",
    minRole: "manager",
    tabs: [
      { slug: "rates",    label: "Rate Plans",     minRole: "manager" },
      { slug: "promos",   label: "Promo Codes",    minRole: "manager" },
      { slug: "testimonials", label: "Testimonials", minRole: "manager" },
      // OTA reviews (Google, Booking.com…) — a different model from the
      // testimonials above, which are quotes the property publishes itself.
      { slug: "reviews",  label: "Reviews",        minRole: "manager" },
      { slug: "messages", label: "Messages",       minRole: "manager" },
      { slug: "shifts",   label: "Staff Schedule", minRole: "manager" },
      { slug: "hotel",    label: "Hotel & Staff",  minRole: "owner" },
      // Owner, not manager — and that is the whole point. Every other admin
      // surface tops out at `manager`, but a manager is inside the group this
      // view exists to oversee. Someone who can read their own audit trail
      // knows its coverage, which is most of what an audit trail is for.
      { slug: "audit",    label: "Activity Log",   minRole: "owner" },
    ],
  },
];

/** Look up a hub by pathname. Returns undefined for non-hub pages. */
export function findHub(pathname: string): NavItem | undefined {
  return NAV.find((item) => item.tabs && item.href === pathname);
}

/** The tabs of a hub that `role` is allowed to see, in declaration order. */
export function visibleTabs(hub: NavItem, role: string): NavTab[] {
  return (hub.tabs ?? []).filter((t) => rank(role) >= RANK_OF[t.minRole]);
}

/**
 * The tab a `?tab=` slug names, ignoring role.
 *
 * `resolveTab` is the one to use for rendering — it falls back to the first
 * tab the *viewer* may see. This one exists for `generateMetadata`, which runs
 * without a resolved session and only needs a label for the browser tab.
 */
export function tabBySlug(hub: NavItem, slug: string | undefined): NavTab | undefined {
  return hub.tabs?.find((t) => t.slug === slug);
}

/**
 * Resolve the active tab for a hub, given the `?tab=` param and the viewer's
 * role. Falls back to the first tab the role is allowed to see, so a front-desk
 * user landing on /admin/money never hits an empty page.
 */
export function resolveTab(
  hub: NavItem,
  requested: string | undefined,
  role: string
): NavTab | undefined {
  const allowed = visibleTabs(hub, role);
  return allowed.find((t) => t.slug === requested) ?? allowed[0];
}

// Local copies to avoid a circular import with rbac-utils.
const RANK_OF: Record<Role, number> = {
  housekeeping: 1,
  frontdesk: 2,
  manager: 3,
  owner: 4,
};

function rank(role: string): number {
  return RANK_OF[role as Role] ?? 0;
}

/**
 * Old single-purpose routes → their new home in a hub.
 * Used to generate redirect pages so existing bookmarks keep working.
 */
export const LEGACY_ROUTES: Record<string, string> = {
  "/admin/rooms":          "/admin/dashboard",
  "/admin/blocked-dates":  "/admin/calendar?tab=blocked",
  "/admin/invoices":       "/admin/money?tab=invoices",
  "/admin/expenses":       "/admin/money?tab=expenses",
  "/admin/reconciliation": "/admin/money?tab=reconcile",
  "/admin/reports":        "/admin/money?tab=reports",
  "/admin/night-audit":    "/admin/money?tab=nightaudit",
  "/admin/rate-plans":     "/admin/setup?tab=rates",
  "/admin/promos":         "/admin/setup?tab=promos",
  "/admin/reviews":        "/admin/setup?tab=reviews",
  "/admin/communications": "/admin/setup?tab=messages",
  "/admin/shifts":         "/admin/setup?tab=shifts",
  "/admin/settings":       "/admin/setup?tab=hotel",
};
