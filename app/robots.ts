import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site-url";

// ─────────────────────────────────────────────────────────────
// /robots.txt
//
// There was none, which meant no crawler was told where the sitemap lives.
//
// The disallow list is not a security boundary — `/admin` is protected by the
// session gate and `/api/admin` by `requireRole`, and neither depends on a
// crawler's good manners. It is here so the admin panel and the booking
// confirmation page do not end up indexed: a confirmation URL carries a
// booking id, and a search result pointing at someone's stay is a privacy
// problem even when the page itself checks who is asking.
// ─────────────────────────────────────────────────────────────

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/api/",
          // Carries a booking id in the query string.
          "/booking/confirmation",
        ],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: absoluteUrl("/"),
  };
}
