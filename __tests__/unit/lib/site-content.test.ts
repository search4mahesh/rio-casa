import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * B-53 — `Package`, `Testimonial`, `BlogPost` and `GalleryImage` were defined
 * in the schema and read by nothing, while the site served hardcoded copies
 * that drifted from them.
 *
 * What these pin is the filtering. Each reader answers "what should be shown",
 * so a draft post or an unapproved testimonial cannot reach a visitor by
 * someone forgetting a `where` at the call site.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: {
    package: { findMany: vi.fn() },
    testimonial: { findMany: vi.fn() },
    blogPost: { findMany: vi.fn(), findFirst: vi.fn() },
    galleryImage: { findMany: vi.fn() },
  },
}));

import {
  getPackages,
  getTestimonials,
  getBlogPosts,
  getBlogPost,
  getGalleryImages,
} from "@/lib/site-content";
import { prisma } from "@/lib/prisma";

const db = prisma as unknown as {
  package: { findMany: ReturnType<typeof vi.fn> };
  testimonial: { findMany: ReturnType<typeof vi.fn> };
  blogPost: { findMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };
  galleryImage: { findMany: ReturnType<typeof vi.fn> };
};

beforeEach(() => vi.clearAllMocks());

describe("getPackages", () => {
  beforeEach(() => db.package.findMany.mockResolvedValue([]));

  it("asks only for active packages", async () => {
    await getPackages();
    expect(db.package.findMany.mock.calls[0][0].where.isActive).toBe(true);
  });

  // The validity window is the reason validFrom/validTo exist. A hardcoded
  // page could only express it as a badge someone had to remember to remove.
  it("excludes packages whose window has not opened or has closed", async () => {
    const now = new Date("2026-09-15T00:00:00Z");
    await getPackages(now);

    const { AND } = db.package.findMany.mock.calls[0][0].where;
    expect(AND).toEqual([
      { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
      { OR: [{ validTo: null }, { validTo: { gte: now } }] },
    ]);
  });

  it("treats a package with no window as always on sale", async () => {
    const { AND } = (await getPackages(), db.package.findMany.mock.calls[0][0].where);
    expect(AND[0].OR).toContainEqual({ validFrom: null });
    expect(AND[1].OR).toContainEqual({ validTo: null });
  });

  it("turns a window into the badge the card shows", async () => {
    db.package.findMany.mockResolvedValue([
      {
        id: "p1", nameEn: "Monsoon Magic", descEn: "…", price: 11000,
        inclusions: [], imageUrl: null,
        validFrom: new Date("2026-07-01T00:00:00Z"),
        validTo: new Date("2026-09-30T00:00:00Z"),
      },
    ]);

    // Derived, not hardcoded: `en-IN` abbreviates September as "Sept", not
    // "Sep", and hardcoding either spelling makes this test about the locale
    // data rather than about the label.
    const month = (iso: string) =>
      new Date(iso).toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" });

    const [pkg] = await getPackages();
    expect(pkg.availability).toBe(`${month("2026-07-01")}–${month("2026-09-30")} only`);
  });

  it("has no badge when the package runs year-round", async () => {
    db.package.findMany.mockResolvedValue([
      { id: "p1", nameEn: "Weekend Getaway", descEn: "…", price: 9500, inclusions: [], imageUrl: null, validFrom: null, validTo: null },
    ]);

    expect((await getPackages())[0].availability).toBeNull();
  });

  it("orders by price, cheapest first", async () => {
    await getPackages();
    expect(db.package.findMany.mock.calls[0][0].orderBy).toEqual({ price: "asc" });
  });
});

describe("getTestimonials", () => {
  beforeEach(() => db.testimonial.findMany.mockResolvedValue([]));

  // `isApproved` defaults to false and implied a workflow with no panel to
  // approve through and no page that would read an approved one.
  it("returns approved testimonials only", async () => {
    await getTestimonials();
    expect(db.testimonial.findMany.mock.calls[0][0].where).toEqual({ isApproved: true });
  });

  it("shows the most recent stay first", async () => {
    await getTestimonials();
    expect(db.testimonial.findMany.mock.calls[0][0].orderBy).toEqual([
      { stayDate: "desc" },
      { createdAt: "desc" },
    ]);
  });

  it("applies a limit when given one, and none otherwise", async () => {
    await getTestimonials(6);
    expect(db.testimonial.findMany.mock.calls[0][0].take).toBe(6);

    await getTestimonials();
    expect(db.testimonial.findMany.mock.calls[1][0].take).toBeUndefined();
  });
});

describe("getBlogPosts / getBlogPost", () => {
  const row = {
    slug: "monsoon-guide",
    titleEn: "Why Monsoon is Best",
    bodyEn: "First paragraph.\n\nSecond paragraph.",
    excerpt: "A short summary.",
    category: "Season Guide",
    coverImage: null,
    publishedAt: new Date("2026-04-22T00:00:00Z"),
  };

  it("returns published posts only", async () => {
    db.blogPost.findMany.mockResolvedValue([]);
    await getBlogPosts();
    expect(db.blogPost.findMany.mock.calls[0][0].where).toEqual({ isPublished: true });
  });

  // A draft must not be readable by anyone who guesses its URL just because
  // the index does not link it.
  it("filters a single post on isPublished as well as the slug", async () => {
    db.blogPost.findFirst.mockResolvedValue(null);
    await getBlogPost("some-draft");

    expect(db.blogPost.findFirst.mock.calls[0][0].where).toEqual({
      slug: "some-draft",
      isPublished: true,
    });
  });

  it("returns null for a post that is missing or unpublished", async () => {
    db.blogPost.findFirst.mockResolvedValue(null);
    expect(await getBlogPost("nope")).toBeNull();
  });

  it("splits the stored body back into paragraphs", async () => {
    db.blogPost.findFirst.mockResolvedValue(row);
    const post = await getBlogPost("monsoon-guide");

    expect(post!.body).toEqual(["First paragraph.", "Second paragraph."]);
  });

  it("derives read time from the body rather than storing it", async () => {
    db.blogPost.findFirst.mockResolvedValue({ ...row, bodyEn: Array(400).fill("word").join(" ") });

    expect((await getBlogPost("monsoon-guide"))!.readTime).toBe("2 min read");
  });

  it("never reports less than a minute", async () => {
    db.blogPost.findFirst.mockResolvedValue({ ...row, bodyEn: "Three words here." });
    expect((await getBlogPost("monsoon-guide"))!.readTime).toBe("1 min read");
  });

  it("falls back to the opening paragraph when there is no excerpt", async () => {
    db.blogPost.findFirst.mockResolvedValue({ ...row, excerpt: null });
    expect((await getBlogPost("monsoon-guide"))!.excerpt).toBe("First paragraph.");
  });

  it("falls back to a category rather than rendering an empty chip", async () => {
    db.blogPost.findFirst.mockResolvedValue({ ...row, category: null });
    expect((await getBlogPost("monsoon-guide"))!.category).toBe("Journal");
  });
});

describe("getGalleryImages", () => {
  it("orders by category then explicit sort order", async () => {
    db.galleryImage.findMany.mockResolvedValue([]);
    await getGalleryImages();

    expect(db.galleryImage.findMany.mock.calls[0][0].orderBy).toEqual([
      { category: "asc" },
      { sortOrder: "asc" },
    ]);
  });

  // A photo a screen reader cannot describe is still a photo on the page.
  it("substitutes a real description when alt text is missing", async () => {
    db.galleryImage.findMany.mockResolvedValue([
      { id: "g1", url: "/images/x.jpg", altText: null, category: "nature" },
    ]);

    expect((await getGalleryImages())[0].altText).toBe("nature photograph at Rio Casa");
  });

  it("keeps real alt text as written", async () => {
    db.galleryImage.findMany.mockResolvedValue([
      { id: "g1", url: "/images/x.jpg", altText: "Forest view from room window", category: "nature" },
    ]);

    expect((await getGalleryImages())[0].altText).toBe("Forest view from room window");
  });
});
