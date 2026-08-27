import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { getBlogPosts } from "@/lib/site-content";
import { pageMetadata } from "@/lib/page-metadata";

export const generateMetadata = () => pageMetadata("blog", "/blog");

// Posts come from `blog_posts`, which nothing read for a long time while the
// site served `BLOG_POSTS` from code (B-53). Publishing a post is now a row,
// not a deploy — which is also what `isPublished` and `publishedAt` were for.
export const dynamic = "force-dynamic";

export default async function BlogPage({ params }: { params: { locale: string } }) {
  const t = await getTranslations("blog");
  const prefix = "";

  let posts: Awaited<ReturnType<typeof getBlogPosts>> = [];
  let loadFailed = false;
  try {
    posts = await getBlogPosts();
  } catch (err) {
    console.error("[blog] Could not load posts.", err);
    loadFailed = true;
  }

  return (
    <div className="min-h-screen bg-earth-bg py-16">
      <div className="container-resort">
        <div className="text-center mb-14">
          <p className="section-subheading mb-2">{t("subtitle")}</p>
          <h1 className="section-heading">{t("title")}</h1>
        </div>

        {loadFailed || posts.length === 0 ? (
          <p className="text-center font-sans text-sm text-earth-text/70 py-12">
            {loadFailed ? t("loadError") : t("none")}
          </p>
        ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {posts.map((post) => (
            <div key={post.slug} className="bg-earth-white rounded-sm shadow-sm overflow-hidden group">
              <div className="h-48 bg-primary-100 flex items-center justify-center text-primary-400 text-sm">
                Blog Cover Image
              </div>
              <div className="p-6">
                <div className="flex items-center gap-3 mb-3">
                  <span className="font-sans text-xs bg-primary-50 text-primary px-2.5 py-1 rounded-full">
                    {post.category}
                  </span>
                  <span className="font-sans text-xs text-earth-text/70">
                    {post.publishedAt?.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}
                  </span>
                  <span className="font-sans text-xs text-earth-text/70">· {post.readTime}</span>
                </div>
                <h2 className="font-serif text-xl text-earth-text mb-3 group-hover:text-primary transition-colors">
                  {post.title}
                </h2>
                <p className="font-sans text-sm text-earth-text/70 leading-relaxed mb-4">{post.excerpt}</p>
                <Link
                  href={`${prefix}/blog/${post.slug}`}
                  className="inline-flex items-center gap-1 font-sans text-sm text-primary hover:text-primary-600 transition-colors"
                >
                  {t("readMore")} <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          ))}
        </div>
        )}
      </div>
    </div>
  );
}
