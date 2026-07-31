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
      { slug: "reviews",  label: "Reviews",        minRole: "manager" },
      { slug: "messages", label: "Messages",       minRole: "manager" },
      { slug: "shifts",   label: "Staff Schedule", minRole: "manager" },
      { slug: "hotel",    label: "Hotel & Staff",  minRole: "owner" },
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
