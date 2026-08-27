/**
 * The site's editorial content: packages, testimonials, blog posts, gallery.
 *
 * `Package`, `Testimonial`, `BlogPost` and `GalleryImage` were fully defined in
 * `schema.prisma` and read by nothing — the site served hardcoded copies, and
 * the two sources drifted (B-53). This script is the transfer: everything the
 * site was showing from code now lives in the database, which the pages read.
 *
 *   npx tsx prisma/seed-content.ts               # upsert the content below
 *   npx tsx prisma/seed-content.ts --exclusive   # …and retire anything else
 *
 * Idempotent. Packages upsert on `nameEn`, blog posts on `slug`, testimonials
 * and gallery images on their natural content key, so re-running never
 * duplicates — the failure `seed-demo.ts` had before B-54, which left four
 * copies of every package.
 *
 * **`--exclusive` retires rather than deletes.** A package not listed here is
 * set `isActive: false` and a testimonial `isApproved: false`; the rows stay,
 * and the admin panel can bring either back. That matters because the database
 * already held demo content from `seed-demo.ts` — six invented guest reviews,
 * all pre-approved. Now that the site actually reads this table, leaving them
 * approved would publish fabricated reviews as real ones.
 */
import { makeScriptClient } from "./script-client";
import { BLOG_POSTS } from "../lib/blog-posts";

const EXCLUSIVE = process.argv.includes("--exclusive");

const prisma = makeScriptClient();

// ─────────────────────────────────────────────────────────────
// Packages — from app/[locale]/packages/page.tsx
//
// `validFrom`/`validTo` are what the hardcoded page could only express as a
// badge someone had to remember to take down. Monsoon Magic carries a real
// window now, so it leaves the page on its own at the end of September.
// ─────────────────────────────────────────────────────────────
const PACKAGES = [
  {
    nameEn: "Weekend Getaway",
    descEn: "The perfect quick escape from city life — relax, explore, and unwind.",
    price: 9500,
    inclusions: [
      "Deluxe Garden View Room (2 nights)",
      "Complimentary breakfast",
      "Welcome drink on arrival",
      "1 nature walk guided tour",
      "Bonfire evening",
    ],
    imageUrl: null,
    validFrom: null,
    validTo: null,
  },
  {
    nameEn: "Monsoon Magic",
    descEn:
      "Experience Mahabaleshwar at its lush green best — magical monsoon views included.",
    price: 11000,
    inclusions: [
      "Premium Valley Suite (2 nights)",
      "Breakfast + dinner",
      "Monsoon trek experience",
      "Hot chocolate welcome",
      "Complimentary rain poncho",
    ],
    imageUrl: "/images/packages/monsoon.jpg",
    validFrom: new Date(Date.UTC(new Date().getUTCFullYear(), 6, 1)),  // 1 Jul
    validTo: new Date(Date.UTC(new Date().getUTCFullYear(), 8, 30)),   // 30 Sep
  },
  {
    nameEn: "Honeymoon Escape",
    descEn:
      "A romantic sojourn crafted for two — rose-petal décor, candle-lit dinner, and spa.",
    price: 18000,
    inclusions: [
      "Premium Valley Suite (2 nights)",
      "Rose petal turn-down service",
      "Candle-lit private dinner",
      "Couple spa session (60 min)",
      "Breakfast in bed",
      "Late check-out (2 PM)",
    ],
    imageUrl: "/images/packages/romantic.jpg",
    validFrom: null,
    validTo: null,
  },
  {
    nameEn: "Corporate Retreat",
    descEn: "Rejuvenate your team with a productive, scenic retreat in the hills.",
    price: 45000,
    inclusions: [
      "Group accommodation (5 rooms, 2 nights)",
      "Conference hall setup",
      "All meals included",
      "Team-building activities",
      "Airport / station pickup",
      "Dedicated event coordinator",
    ],
    imageUrl: null,
    validFrom: null,
    validTo: null,
  },
];

// ─────────────────────────────────────────────────────────────
// Testimonials — from components/sections/Testimonials.tsx
//
// Seeded approved, because these are the three the site was already showing.
// Anything arriving later starts unapproved, which is what `isApproved`
// defaulting to false was always for.
// ─────────────────────────────────────────────────────────────
const TESTIMONIALS = [
  {
    guestName: "Priya Sharma",
    location: "Mumbai",
    review:
      "Rio Casa is an absolute gem. The rooms are stunning, the staff is warm, and waking up to the mist-covered hills every morning was pure magic.",
    rating: 5,
    stayDate: new Date(Date.UTC(2026, 3, 1)),
  },
  {
    guestName: "Arjun & Meera Patel",
    location: "Pune",
    review:
      "We celebrated our anniversary here and it was perfect. The honeymoon package was thoughtfully curated — the bonfire dinner was unforgettable!",
    rating: 5,
    stayDate: new Date(Date.UTC(2026, 2, 1)),
  },
  {
    guestName: "Rahul Deshmukh",
    location: "Nashik",
    review:
      "Best resort in Mahabaleshwar, hands down. The valley view from our suite was breathtaking. Will definitely return in monsoon!",
    rating: 5,
    stayDate: new Date(Date.UTC(2026, 1, 1)),
  },
];

// ─────────────────────────────────────────────────────────────
// Gallery — from app/[locale]/gallery/page.tsx
//
// `sortOrder` preserves the order the page hardcoded; the categories match the
// filter buttons it already renders.
// ─────────────────────────────────────────────────────────────
const GALLERY: Array<{ url: string; category: string; altText: string }> = [
  { url: "/images/rooms/deluxe-main.jpg",        category: "rooms",     altText: "Standard Room — double bed with wood ceiling" },
  { url: "/images/rooms/premium-bed.jpg",        category: "rooms",     altText: "Luxury Room — upholstered headboard" },
  { url: "/images/rooms/premium-bathtub.jpg",    category: "rooms",     altText: "Luxury Room — soaking bathtub" },
  { url: "/images/rooms/family-main.jpg",        category: "rooms",     altText: "Family Room — two double beds" },
  { url: "/images/rooms/family-beds.jpg",        category: "rooms",     altText: "Family Room — side-by-side beds" },
  { url: "/images/rooms/deluxe-wardrobe.jpg",    category: "rooms",     altText: "Standard Room — wardrobe and TV unit" },
  { url: "/images/rooms/bathroom-vessel.jpg",    category: "rooms",     altText: "Ensuite bathroom — vessel sink and round mirror" },
  { url: "/images/rooms/bathroom-grey.jpg",      category: "rooms",     altText: "Ensuite bathroom — grey marble" },
  { url: "/images/rooms/bathroom-dark.jpg",      category: "rooms",     altText: "Ensuite bathroom — dark marble tiles" },
  { url: "/images/rooms/room-entrance.jpg",      category: "rooms",     altText: "Room entrance" },
  { url: "/images/rooms/balcony-chairs.jpg",     category: "amenities", altText: "Private balcony — rattan chairs and table" },
  { url: "/images/rooms/balcony-courtyard.jpg",  category: "amenities", altText: "Balcony — courtyard view" },
  { url: "/images/rooms/balcony-wide.jpg",       category: "amenities", altText: "Balcony — wide open view" },
  { url: "/images/rooms/tea-coffee.jpg",         category: "amenities", altText: "In-room tea & coffee station" },
  { url: "/images/gallery/amenities/staircase-wood.jpg",    category: "amenities", altText: "Staircase — polished wood floor" },
  { url: "/images/gallery/amenities/staircase-granite.jpg", category: "amenities", altText: "Staircase — granite steps and steel railing" },
  { url: "/images/gallery/rooms/corridor-upper.jpg",        category: "amenities", altText: "Upper-floor corridor" },
  { url: "/images/gallery/rooms/corridor-lower.jpg",        category: "amenities", altText: "Ground-floor corridor" },
  { url: "/images/rooms/view-forest.jpg",        category: "nature",    altText: "Forest view from room window" },
  { url: "/images/hero/exterior-front.jpg",      category: "nature",    altText: "Rio Casa — front view" },
  { url: "/images/hero/exterior-wide.jpg",       category: "nature",    altText: "Rio Casa — wide angle" },
  { url: "/images/hero/exterior-courtyard.jpg",  category: "nature",    altText: "Resort courtyard" },
  { url: "/images/hero/hero-night.jpg",          category: "nature",    altText: "Rio Casa at night" },
];

async function seedPackages() {
  for (const p of PACKAGES) {
    await prisma.package.upsert({
      where: { nameEn: p.nameEn },
      // Price, copy and inclusions are re-asserted on every run; `isActive` is
      // not touched on update, so a package retired from the admin panel is not
      // silently brought back by a re-seed.
      update: {
        descEn: p.descEn,
        price: p.price,
        inclusions: p.inclusions,
        imageUrl: p.imageUrl,
        validFrom: p.validFrom,
        validTo: p.validTo,
      },
      create: { ...p, isActive: true },
    });
  }
  console.log(`  packages     ${PACKAGES.length} upserted`);

  if (EXCLUSIVE) {
    const { count } = await prisma.package.updateMany({
      where: { nameEn: { notIn: PACKAGES.map((p) => p.nameEn) }, isActive: true },
      data: { isActive: false },
    });
    if (count) console.log(`               ${count} other package(s) retired (isActive=false)`);
  }
}

async function seedTestimonials() {
  for (const t of TESTIMONIALS) {
    const existing = await prisma.testimonial.findFirst({
      where: { guestName: t.guestName, review: t.review },
      select: { id: true },
    });
    if (existing) {
      await prisma.testimonial.update({
        where: { id: existing.id },
        data: { location: t.location, rating: t.rating, stayDate: t.stayDate },
      });
    } else {
      await prisma.testimonial.create({ data: { ...t, isApproved: true } });
    }
  }
  console.log(`  testimonials ${TESTIMONIALS.length} upserted`);

  if (EXCLUSIVE) {
    const { count } = await prisma.testimonial.updateMany({
      where: { guestName: { notIn: TESTIMONIALS.map((t) => t.guestName) }, isApproved: true },
      data: { isApproved: false },
    });
    if (count) {
      console.log(`               ${count} other testimonial(s) unapproved — they were demo data`);
      console.log(`               and would otherwise publish as real guest reviews.`);
    }
  }
}

async function seedBlog() {
  for (const post of BLOG_POSTS) {
    const publishedAt = new Date(post.date);
    const data = {
      titleEn: post.title,
      // Paragraphs are stored blank-line separated and split back out on read;
      // `readTime` is derived from the words rather than stored, so it cannot
      // drift from the body after an edit.
      bodyEn: post.body.join("\n\n"),
      excerpt: post.excerpt,
      category: post.category,
      isPublished: true,
      publishedAt: Number.isNaN(publishedAt.getTime()) ? new Date() : publishedAt,
    };
    await prisma.blogPost.upsert({
      where: { slug: post.slug },
      update: data,
      create: { slug: post.slug, ...data },
    });
  }
  console.log(`  blog posts   ${BLOG_POSTS.length} upserted`);
}

async function seedGallery() {
  for (const [i, img] of GALLERY.entries()) {
    const existing = await prisma.galleryImage.findFirst({
      where: { url: img.url },
      select: { id: true },
    });
    if (existing) {
      await prisma.galleryImage.update({
        where: { id: existing.id },
        data: { altText: img.altText, category: img.category, sortOrder: i },
      });
    } else {
      await prisma.galleryImage.create({ data: { ...img, sortOrder: i } });
    }
  }
  console.log(`  gallery      ${GALLERY.length} upserted`);
}

async function main() {
  console.log(`\nSeeding site content${EXCLUSIVE ? " (exclusive)" : ""}…\n`);

  await seedPackages();
  await seedTestimonials();
  await seedBlog();
  await seedGallery();

  if (!EXCLUSIVE) {
    const strayPackages = await prisma.package.count({
      where: { nameEn: { notIn: PACKAGES.map((p) => p.nameEn) }, isActive: true },
    });
    const strayTestimonials = await prisma.testimonial.count({
      where: { guestName: { notIn: TESTIMONIALS.map((t) => t.guestName) }, isApproved: true },
    });
    if (strayPackages || strayTestimonials) {
      console.log(
        `\n  ${strayPackages} package(s) and ${strayTestimonials} testimonial(s) not listed here are live.`
      );
      console.log("  Re-run with --exclusive to retire them.");
    }
  }

  console.log("\nDone.\n");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
