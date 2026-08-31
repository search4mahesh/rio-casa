import type { Metadata } from "next";
import { NAV, tabBySlug } from "@/lib/admin-nav";
import { ADMIN_BRAND } from "@/lib/property";

// ─────────────────────────────────────────────────────────────
// Browser-tab titles for the admin panel.
//
// Every admin page inherited the root layout's default, so all of them showed
// "Rio Casa — Luxury Resort in Mahabaleshwar". With several tabs open — which
// is how the panel is actually used, one for the calendar and one for the
// booking being taken — none of them could be told apart. This is B-52's
// complaint, on the admin side.
//
// The tab label leads, because that is what differs: `/admin/money?tab=reports`
// and `?tab=invoices` are the same *page*, and a title of "Money" for both
// would fix nothing. `app/admin/layout.tsx` appends "· Rio Casa Admin".
// ─────────────────────────────────────────────────────────────

/**
 * Title for a hub page, from its `?tab=`.
 *
 * ```ts
 * export const generateMetadata = ({ searchParams }) =>
 *   adminHubMetadata("/admin/money", searchParams.tab);
 * ```
 *
 * Falls back to the hub's first tab when the param is missing or unknown,
 * which is what a viewer with full access lands on. A lower-ranked viewer may
 * be shown a different first tab — `resolveTab` decides that — so the title
 * can be one tab out for them. A slightly wrong label beats a title that is
 * identical across every page, and reading the session here would make every
 * admin page's metadata a database query.
 */
export function adminHubMetadata(href: string, tabSlug?: string): Metadata {
  const hub = NAV.find((n) => n.href === href);
  if (!hub) return { title: "Admin" };

  const tab = tabBySlug(hub, tabSlug) ?? hub.tabs?.[0];
  return { title: tab ? `${tab.label} · ${hub.label}` : hub.label };
}

/** Title for an admin page with no tabs. */
export function adminMetadata(title: string): Metadata {
  return { title };
}

/**
 * The suffix every admin tab title carries. Defined here, and referenced by
 * `app/admin/layout.tsx` and `adminSectionMetadata` below, so the two cannot
 * drift into two different suffixes.
 */
export const ADMIN_TITLE_TEMPLATE = `%s · ${ADMIN_BRAND}`;

/**
 * Title for a layout that has child *routes* under it.
 *
 * Setting a plain string title on a layout consumes the template inherited
 * from `app/admin/layout.tsx`, leaving nested routes with a bare title:
 * `/admin/bookings/[id]` rendered "Booking" while `/admin/guests/[id]`
 * — whose parent sets no title — correctly rendered "Guest · Rio Casa Admin".
 *
 * Re-declaring the template here restores it for the children. `default` still
 * gets wrapped by the *parent's* template, so the layout's own route is
 * unaffected.
 */
export function adminSectionMetadata(title: string): Metadata {
  return { title: { default: title, template: ADMIN_TITLE_TEMPLATE } };
}
