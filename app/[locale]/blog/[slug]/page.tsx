import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { BLOG_POSTS, getPost } from "@/lib/blog-posts";

export function generateStaticParams() {
  return BLOG_POSTS.map((p) => ({ slug: p.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const post = getPost(params.slug);
  if (!post) return { title: "Post not found" };
  return { title: post.title, description: post.excerpt };
}

export default function BlogPostPage({ params }: { params: { locale: string; slug: string } }) {
  const post = getPost(params.slug);
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
        <p className="font-sans text-sm text-earth-text/50 mb-8">
          {post.date} · {post.readTime}
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
