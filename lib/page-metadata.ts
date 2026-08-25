import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

// ─────────────────────────────────────────────────────────────
// Per-page title and description.
//
// `app/layout.tsx` defines the template — `%s | Rio Casa Mahabaleshwar` with a
// default — and for a long time almost nothing supplied the `%s`. Eleven of
// the thirteen public pages inherited the default, so /rooms/luxury,
// /packages, /contact and the rest all returned the identical title *and* the
// identical description: a guest with two tabs open could not tell them apart,
// and the pages competed with each other in search for one snippet (B-52).
//
// The copy lives in the `meta` namespace of `messages/en.json` like every
// other visible string, and is read with `getTranslations` — the server-side
// half of next-intl, which is what CLAUDE.md specifies for metadata.
//
// **Titles here carry no brand name.** The root template appends it. Writing
// "Rooms — Rio Casa" yields "Rooms — Rio Casa | Rio Casa Mahabaleshwar", which
// is how the blog and privacy pages ended up saying it twice.
// ─────────────────────────────────────────────────────────────

/**
 * Metadata for a static page, keyed by its entry under `meta` in en.json.
 *
 * ```ts
 * export const generateMetadata = () => pageMetadata("about");
 * ```
 */
export async function pageMetadata(key: string): Promise<Metadata> {
  const t = await getTranslations("meta");
  return {
    title: t(`${key}.title`),
    description: t(`${key}.description`),
  };
}
