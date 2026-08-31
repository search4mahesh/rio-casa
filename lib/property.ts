// ─────────────────────────────────────────────────────────────
// The property this deployment serves.
//
// Every fact about the property — its name, where it is, how to reach it —
// was written out wherever it happened to be needed: the root layout, the
// title template in two more files, the schema.org graph, the footer, the
// navbar, the hero, the map section, the WhatsApp prefill, the confirmation
// email and the invoice mail. Thirty-odd literals for a dozen facts, and
// nothing tying them together, so "Rio Casa Resort" and "Rio Casa" and
// "Rio Casa Mahabaleshwar" all coexisted and none of them knew about the
// others. That is the shape B-52 came in: the brand written twice because the
// two places that wrote it could not see each other.
//
// So the facts live here once, and everything else reads them.
//
// **What belongs here and what does not.** These are *facts*, not copy. The
// property's name and address are facts; "Your serene escape in the Sahyadri
// hills" is copy and stays in `messages/en.json` like every other visible
// string. Copy that needs to *name* the property takes it as an ICU
// parameter — `"© {year} {property}. All rights reserved."` — so the sentence
// stays translatable and the name stays single-sourced.
//
// **Secrets and per-environment values stay in the environment.** `HOTEL_GSTIN`
// is not here: it fails shut in production on purpose (B-62), and moving it
// into a committed file would hand it a fallback again. Same for
// `NEXT_PUBLIC_SITE_URL` (lib/site-url.ts) and the WhatsApp number. What lives
// here is what is true about the property regardless of where it is deployed.
//
// **This is not multi-tenancy.** A second property under the same firm gets its
// own deployment — its own database, its own environment, its own domain — and
// this is the file that differs between them. It is deliberately a plain
// module with no imports: it is read by client components, by server
// components, by route handlers and by `app/layout.tsx`, and it must be usable
// from all of them.
// ─────────────────────────────────────────────────────────────

export interface PropertySocial {
  instagram: string;
  facebook: string;
}

export interface PropertyIdentity {
  /** Trading name, as the guest sees it. */
  name: string;
  /**
   * What the property *is*, for a page title: "Rio Casa — Luxury Resort in
   * Mahabaleshwar". Kept apart from the name so the name can be used alone.
   */
  descriptor: string;

  city: string;
  district: string;
  region: string;
  postalCode: string;
  /** ISO 3166-1 alpha-2, for schema.org's `addressCountry`. */
  addressCountry: string;

  /** One-line postal address as the site renders it. */
  address: string;
  /**
   * Name and address as they appear on a tax invoice.
   *
   * Separate from `name`/`address` because a GST invoice carries the
   * registered entity, which need not be the trading name — and because
   * `HOTEL_NAME` / `HOTEL_ADDRESS` override both. These are the fallbacks
   * those variables fall back *to*, so a development box still renders a
   * plausible invoice.
   */
  billingName: string;
  billingAddress: string;

  phone: string;
  /** General enquiries. The fallback for `EMAIL_RESORT`. */
  email: string;
  /** Transactional sender. The fallback for `EMAIL_FROM`. */
  bookingsEmail: string;
  /** Shown on the confirmation screen when a guest pays by UPI transfer. */
  upiId: string;

  /** Site-wide description: Open Graph, the root metadata, and search. */
  description: string;
  /** One sentence for the schema.org graph, which wants prose, not marketing. */
  schemaDescription: string;
  keywords: string[];

  /** The `<iframe>` src on the home page's location section. */
  mapEmbedUrl: string;

  /** Photographs that stand for the property itself, not for a room. */
  images: {
    /** 1200×630. What a shared link previews with. */
    og: string;
    exteriorWide: string;
  };

  social: PropertySocial;
}

export const PROPERTY: PropertyIdentity = {
  name: "Rio Casa",
  descriptor: "Luxury Resort in Mahabaleshwar",

  city: "Mahabaleshwar",
  district: "Satara District",
  region: "Maharashtra",
  postalCode: "412806",
  addressCountry: "IN",

  address: "Mahabaleshwar, Satara District, Maharashtra — 412806",
  billingName: "Rio Casa Resort",
  billingAddress: "Mahabaleshwar, Satara District, Maharashtra - 412806",

  phone: "+91 98765 43210",
  email: "info@riocasa.in",
  bookingsEmail: "bookings@riocasa.in",
  upiId: "riocasa@paytm",

  description:
    "Experience nature's serenity at Rio Casa, a boutique resort nestled in the hills of Mahabaleshwar. Book rooms, explore packages, and discover Mahabaleshwar's beauty.",
  schemaDescription:
    "A boutique resort in the Sahyadri hills at Mahabaleshwar, Maharashtra — rooms, suites and family stays, bookable direct.",
  keywords: [
    "Mahabaleshwar resort",
    "Rio Casa",
    "hill station resort",
    "Maharashtra resort",
    "book resort Mahabaleshwar",
  ],

  mapEmbedUrl:
    "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d30382.48!2d73.6579!3d17.9237!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3bc23e44e0c78083%3A0x4d52534b5ed33ef4!2sMahabaleshwar%2C%20Maharashtra!5e0!3m2!1sen!2sin!4v1680000000000!5m2!1sen!2sin",

  images: {
    og: "/images/hero/exterior-front.jpg",
    exteriorWide: "/images/hero/exterior-wide.jpg",
  },

  social: {
    instagram: "https://instagram.com/riocasamahabaleshwar",
    facebook: "https://facebook.com/riocasamahabaleshwar",
  },
};

/**
 * Brand plus place — "Rio Casa Mahabaleshwar".
 *
 * The suffix a page title carries, and the form Open Graph needs spelled out
 * because Next's `title.template` wraps the `<title>` tag *only*. It was
 * written literally in three places across two files.
 */
export const BRAND = `${PROPERTY.name} ${PROPERTY.city}`;

/** The home page's title, and the default every untitled page inherits. */
export const SITE_TITLE = `${PROPERTY.name} — ${PROPERTY.descriptor}`;

/** `app/layout.tsx`'s `title.template`. */
export const TITLE_TEMPLATE = `%s | ${BRAND}`;

/** The admin panel titles itself separately — see lib/admin-metadata.ts. */
export const ADMIN_BRAND = `${PROPERTY.name} Admin`;

/**
 * A dialable `tel:` URI.
 *
 * `phone` is stored in its display form, spaces and all; a `tel:` href with
 * spaces in it is not guaranteed to dial.
 */
export function telHref(): string {
  return `tel:${PROPERTY.phone.replace(/[^\d+]/g, "")}`;
}
