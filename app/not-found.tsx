import Link from "next/link";

/**
 * Root 404 — for paths that match no route at all, including anything under
 * `/admin` that does not exist.
 *
 * Public pages have their own at `app/[locale]/not-found.tsx`, which renders
 * inside the locale layout and so keeps the navbar, the footer and the
 * translated copy. This one sits above every layout: there is no
 * `NextIntlClientProvider` here, so no `useTranslations`, and no site chrome
 * to inherit. It is deliberately plain — its job is to be a way back rather
 * than a designed page, and almost every real 404 is caught below it.
 */
export default function RootNotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-earth-bg">
      <div className="text-center max-w-sm">
        <p className="font-sans text-sm tracking-[0.3em] uppercase text-accent mb-3">404</p>
        <h1 className="font-serif text-3xl text-earth-text mb-3">Page not found</h1>
        <p className="font-sans text-sm text-earth-text/70 mb-8">
          The page you are looking for does not exist, or has moved.
        </p>
        <Link href="/" className="btn-primary px-6 py-3">
          Back to home
        </Link>
      </div>
    </div>
  );
}
