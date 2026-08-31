import { prisma } from "@/lib/prisma";
import { PROPERTY } from "@/lib/property";

// ─────────────────────────────────────────────────────────────
// Editorial content the site shows: testimonials, blog posts and gallery
// images.
//
// These models were fully defined in `schema.prisma` and read by nothing. The
// site served hardcoded copies instead, and the two sources drifted — the
// reason it mattered is not tidiness: **editing content was a code change and
// a deploy** (B-53).
//
// Packages were the fourth reader here and are gone: the property does not
// sell packages, so `/packages`, its admin panel and this module's
// `getPackages` were removed. The `packages` table and the `Package` model are
// deliberately still in place — nothing reads them.
//
// Everything here is server-only and returns plain objects, so pages stay
// server components. Each reader is deliberately narrow — the site asks for
// "what should be shown", never for "all rows", so an unapproved testimonial
// or an unpublished post cannot reach a visitor by someone forgetting a filter
// at the call site.
// ─────────────────────────────────────────────────────────────

export interface SiteTestimonial {
  id: string;
  guestName: string;
  location: string | null;
  review: string;
  rating: number;
  stayDate: Date | null;
}

export interface SiteBlogPost {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  /** Paragraphs, in order — the body is stored as blank-line-separated text. */
  body: string[];
  readTime: string;
  coverImage: string | null;
  publishedAt: Date | null;
}

export interface SiteGalleryImage {
  id: string;
  url: string;
  altText: string;
  category: string;
}

/**
 * Approved testimonials, most recent stay first.
 *
 * `isApproved` defaults to false and implied an approval workflow that had no
 * panel to approve through and no page that would have read an approved one.
 * Both ends exist now: Setup → Testimonials, and this.
 */
export async function getTestimonials(limit?: number): Promise<SiteTestimonial[]> {
  const rows = await prisma.testimonial.findMany({
    where: { isApproved: true },
    orderBy: [{ stayDate: "desc" }, { createdAt: "desc" }],
    ...(limit ? { take: limit } : {}),
  });

  return rows.map((t) => ({
    id: t.id,
    guestName: t.guestName,
    location: t.location,
    review: t.review,
    rating: t.rating,
    stayDate: t.stayDate,
  }));
}

/** Published posts, newest first. */
export async function getBlogPosts(): Promise<SiteBlogPost[]> {
  const rows = await prisma.blogPost.findMany({
    where: { isPublished: true },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
  });

  return rows.map(toPost);
}

/**
 * One published post, or null.
 *
 * Filters on `isPublished` as well as the slug: a draft must not be readable
 * by anyone who guesses its URL just because the index does not link it.
 */
export async function getBlogPost(slug: string): Promise<SiteBlogPost | null> {
  const row = await prisma.blogPost.findFirst({ where: { slug, isPublished: true } });
  return row ? toPost(row) : null;
}

function toPost(p: {
  slug: string;
  titleEn: string;
  bodyEn: string;
  excerpt: string | null;
  category: string | null;
  coverImage: string | null;
  publishedAt: Date | null;
}): SiteBlogPost {
  const body = p.bodyEn
    .split(/\n\s*\n/)
    .map((para) => para.trim())
    .filter(Boolean);

  return {
    slug: p.slug,
    title: p.titleEn,
    // Falls back to the opening paragraph rather than rendering an empty card.
    excerpt: p.excerpt?.trim() || body[0] || "",
    category: p.category?.trim() || "Journal",
    body,
    readTime: readTimeOf(body),
    coverImage: p.coverImage,
    publishedAt: p.publishedAt,
  };
}

/**
 * Derived from the body rather than stored.
 *
 * A stored read time is a copy of a fact already in the row, and copies drift:
 * edit the post, forget the field, and the card advertises the old length
 * forever. 200 words a minute is the usual reading-speed convention.
 */
function readTimeOf(paragraphs: string[]): string {
  const words = paragraphs.join(" ").split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.round(words / 200))} min read`;
}

/** Gallery images, grouped-friendly: ordered by category then explicit order. */
export async function getGalleryImages(): Promise<SiteGalleryImage[]> {
  const rows = await prisma.galleryImage.findMany({
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
  });

  return rows.map((g) => ({
    id: g.id,
    url: g.url,
    // An empty alt on a decorative-looking photo is still a photo a screen
    // reader cannot describe. Falling back to the category is a poor
    // description but a real one.
    altText: g.altText ?? `${g.category} photograph at ${PROPERTY.name}`,
    category: g.category,
  }));
}
