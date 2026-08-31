import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site-url";
import { getRoomCategories } from "@/lib/room-catalogue";
import { getBlogPosts } from "@/lib/site-content";

// ─────────────────────────────────────────────────────────────
// /sitemap.xml
//
// There was none, so every page relied on being found by a crawl from the
// home page. Room detail pages are the ones that matter — they are what a
// search for "family room Mahabaleshwar" should land on, and the page a
// direct booking starts from.
//
// Room slugs come from `getRoomCategories()`, the same source `/rooms` and the
// wizard read, so the sitemap can never advertise a category the property does
// not have or miss one it added.
// ─────────────────────────────────────────────────────────────

/**
 * `changeFrequency` and `priority` are hints, and modern crawlers largely
 * ignore them — they are included because they cost nothing and some smaller
 * engines still read them. `lastModified` is the field that actually earns its
 * place.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = ([
    { url: absoluteUrl("/"),         changeFrequency: "weekly",  priority: 1.0 },
    { url: absoluteUrl("/rooms"),    changeFrequency: "daily",   priority: 0.9 },
    { url: absoluteUrl("/booking"),  changeFrequency: "weekly",  priority: 0.9 },
    { url: absoluteUrl("/gallery"),  changeFrequency: "monthly", priority: 0.7 },
    { url: absoluteUrl("/dining"),   changeFrequency: "monthly", priority: 0.7 },
    { url: absoluteUrl("/about"),    changeFrequency: "yearly",  priority: 0.6 },
    { url: absoluteUrl("/contact"),  changeFrequency: "yearly",  priority: 0.6 },
    { url: absoluteUrl("/blog"),     changeFrequency: "weekly",  priority: 0.6 },
    { url: absoluteUrl("/privacy"),  changeFrequency: "yearly",  priority: 0.2 },
  ] satisfies MetadataRoute.Sitemap).map((entry) => ({ ...entry, lastModified: now }));

  // A database failure must not take the whole sitemap down: a sitemap missing
  // some pages is a bad day, and a 500 where search engines expect XML is a
  // worse one. Each source is caught separately so one failing does not cost
  // the other.
  let roomPages: MetadataRoute.Sitemap = [];
  try {
    const categories = await getRoomCategories();
    roomPages = categories.map((category) => ({
      url: absoluteUrl(`/rooms/${category.slug}`),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    }));
  } catch (err) {
    console.error("[sitemap] Could not list room categories; serving without them.", err);
  }

  // Published posts only, from `blog_posts` — the same reader the blog itself
  // uses, so the sitemap cannot advertise a draft (B-53).
  let blogPages: MetadataRoute.Sitemap = [];
  try {
    const posts = await getBlogPosts();
    blogPages = posts.map((post) => ({
      url: absoluteUrl(`/blog/${post.slug}`),
      lastModified: post.publishedAt ?? now,
      changeFrequency: "yearly",
      priority: 0.5,
    }));
  } catch (err) {
    console.error("[sitemap] Could not list blog posts; serving without them.", err);
  }

  return [...staticPages, ...roomPages, ...blogPages];
}
