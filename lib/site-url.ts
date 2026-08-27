// ─────────────────────────────────────────────────────────────
// The site's canonical origin.
//
// `NEXT_PUBLIC_SITE_URL` sat in `.env` and was read by nothing, while the
// pieces that needed it did not exist: there was no sitemap, no robots.txt,
// no `metadataBase`, and no structured data. For a property whose stated goal
// is direct bookings — competing against OTA commission — that is the whole
// acquisition channel left unbuilt.
//
// Everything canonical goes through here so a wrong origin is wrong in one
// place rather than in six, and so a stray trailing slash cannot produce
// `https://riocasa.in//rooms`.
// ─────────────────────────────────────────────────────────────

const FALLBACK = "https://riocasa.in";

/**
 * The origin, with no trailing slash.
 *
 * Falls back to the production domain rather than to localhost: a build
 * without the variable set should emit a sitemap and canonical tags that are
 * merely *stale*, not ones pointing search engines at `http://localhost:3000`.
 * The local `.env` sets it to localhost so development is honest about itself.
 */
export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const base = configured && configured.length > 0 ? configured : FALLBACK;
  return base.replace(/\/+$/, "");
}

/** An absolute URL for a site-relative path. `absoluteUrl("/rooms")`. */
export function absoluteUrl(path = "/"): string {
  return `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * `metadataBase` for Next's metadata API.
 *
 * Without it, relative `openGraph.images` resolve against `localhost` at build
 * time and Next logs a warning on every page — so a shared link renders with
 * no preview image at all.
 */
export function metadataBase(): URL {
  return new URL(siteUrl());
}
