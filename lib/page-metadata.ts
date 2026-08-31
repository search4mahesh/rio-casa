import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { absoluteUrl } from "@/lib/site-url";
import { BRAND, PROPERTY } from "@/lib/property";

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
 * export const generateMetadata = () => pageMetadata("about", "/about");
 * ```
 *
 * `path` gives the page a canonical URL and a per-page Open Graph title, so a
 * link to /rooms shared on WhatsApp previews as "Rooms & Suites" rather than
 * inheriting the site-wide default from the root layout. Omitting it keeps the
 * old behaviour — title and description only — for a page with no stable URL
 * of its own.
 */
export async function pageMetadata(key: string, path?: string): Promise<Metadata> {
  const t = await getTranslations("meta");
  // The copy names the property through ICU parameters rather than spelling it
  // out, so the name lives in lib/property.ts alone. Every meta string is read
  // here, which is what makes one set of values enough.
  const values = { property: PROPERTY.name, city: PROPERTY.city };
  const title = t(`${key}.title`, values);
  const description = t(`${key}.description`, values);

  if (!path) return { title, description };

  return {
    title,
    description,
    // A canonical is what stops `/rooms`, `/rooms?checkIn=…&checkOut=…` and
    // every other date combination being crawled as separate pages competing
    // with each other for the same snippet.
    alternates: { canonical: path },
    openGraph: {
      url: absoluteUrl(path),
      // The root layout's template does not apply to Open Graph, so the brand
      // is written out here rather than left off (B-52 is about the <title>
      // tag, which the template *does* wrap).
      title: `${title} | ${BRAND}`,
      description,
    },
    twitter: {
      title: `${title} | ${BRAND}`,
      description,
    },
  };
}
