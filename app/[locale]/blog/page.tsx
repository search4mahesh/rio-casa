import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";

const posts = [
  {
    slug: "best-things-to-do-mahabaleshwar",
    title: "10 Best Things To Do in Mahabaleshwar",
    excerpt: "From Venna Lake boating to strawberry picking — your complete guide to experiencing Mahabaleshwar like a local.",
    date: "May 10, 2025",
    readTime: "6 min read",
    category: "Travel Guide",
  },
  {
    slug: "mahabaleshwar-monsoon-guide",
    title: "Why Monsoon is the Best Time to Visit Mahabaleshwar",
    excerpt: "Everything turns lush green, the waterfalls roar, and the mist clings to the hills — discover why July–September is magical.",
    date: "April 22, 2025",
    readTime: "5 min read",
    category: "Season Guide",
  },
  {
    slug: "romantic-weekend-getaway-pune",
    title: "The Perfect Romantic Weekend Getaway from Pune",
    excerpt: "3-hour drive, mountain air, strawberry breakfast, candlelit dinners. Here's the Rio Casa weekend itinerary couples love.",
    date: "March 15, 2025",
    readTime: "4 min read",
    category: "Packages",
  },
  {
    slug: "mahabaleshwar-strawberry-season",
    title: "Mahabaleshwar Strawberry Season: When & Where",
    excerpt: "Mahabaleshwar produces over 85% of India's strawberries. Here's everything you need to know about the season.",
    date: "February 28, 2025",
    readTime: "5 min read",
    category: "Local Guide",
  },
];

export default function BlogPage({ params }: { params: { locale: string } }) {
  const t = useTranslations("blog");
  const prefix = params.locale !== "en" ? `/${params.locale}` : "";

  return (
    <div className="min-h-screen bg-earth-bg py-16">
      <div className="container-resort">
        <div className="text-center mb-14">
          <p className="section-subheading mb-2">{t("subtitle")}</p>
          <h1 className="section-heading">{t("title")}</h1>
        </div>

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
                  <span className="font-sans text-xs text-earth-text/40">{post.date}</span>
                  <span className="font-sans text-xs text-earth-text/40">· {post.readTime}</span>
                </div>
                <h2 className="font-serif text-xl text-earth-text mb-3 group-hover:text-primary transition-colors">
                  {post.title}
                </h2>
                <p className="font-sans text-sm text-earth-text/60 leading-relaxed mb-4">{post.excerpt}</p>
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
      </div>
    </div>
  );
}
