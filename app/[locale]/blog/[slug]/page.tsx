import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getBlogPost } from "@/lib/site-content";
import { absoluteUrl } from "@/lib/site-url";
import { BRAND } from "@/lib/property";
import { CONTENT_REVALIDATE_SECONDS } from "@/lib/content-cache";

// Was statically generated from a hardcoded array. Posts live in `blog_posts`
// now (B-53), so the set of slugs is not known at build time — and a post
// published from the admin panel should appear without a deploy, which is the
// whole point of moving it.
// Revalidated on a timer rather than read per visitor. `force-dynamic` was
// the right correction to B-74 (this page was prerendered at build, so this post
// went stale until the next deploy) but it made every visitor pay a database
// round trip — and, on a property this quiet, often the ~1.9s connection
// handshake that follows an idle pool. A minute is the window; see
// `lib/content-cache.ts` for why the floor is time and not tags.
export const revalidate = CONTENT_REVALIDATE_SECONDS;

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const post = await getBlogPost(params.slug);
  // Unpublished and non-existent look the same from out here, deliberately: a
  // draft must not be discoverable by guessing its URL.
  if (!post) return { title: "Post not found", robots: { index: false } };

  const path = `/blog/${post.slug}`;
  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: path },
    openGraph: {
      type: "article",
      url: absoluteUrl(path),
      title: `${post.title} | ${BRAND}`,
      description: post.excerpt,
      publishedTime: post.publishedAt?.toISOString(),
    },
  };
}

export default async function BlogPostPage({ params }: { params: { locale: string; slug: string } }) {
  const post = await getBlogPost(params.slug);
  if (!post) notFound();

  return (
    <div className="min-h-screen bg-earth-bg py-16">
      <article className="container-resort max-w-2xl">
        <Link
          href="/blog"
          className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80 mb-8 font-sans"
        >
          <ArrowLeft size={16} />
          Back to Blog
        </Link>

        <p className="font-sans text-xs text-primary bg-primary/5 inline-block px-2.5 py-1 rounded-full mb-3">
          {post.category}
        </p>
        <h1 className="section-heading mb-3">{post.title}</h1>
        <p className="font-sans text-sm text-earth-text/70 mb-8">
          {[
            post.publishedAt?.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
            post.readTime,
          ].filter(Boolean).join(" · ")}
        </p>

        <p className="font-sans text-lg text-earth-text/80 leading-relaxed mb-8 italic">
          {post.excerpt}
        </p>

        <div className="space-y-5">
          {post.body.map((para, i) => (
            <p key={i} className="font-sans text-earth-text/70 leading-relaxed">
              {para}
            </p>
          ))}
        </div>

        <div className="mt-12 pt-8 border-t border-primary/10 text-center">
          <p className="font-serif text-xl text-earth-text mb-4">Planning a visit?</p>
          <Link href="/booking" className="btn-primary">
            Check availability
          </Link>
        </div>
      </article>
    </div>
  );
}
