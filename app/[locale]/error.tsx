"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";

/**
 * Public-site error boundary.
 *
 * There was no `error.tsx` anywhere in the app, so a thrown render error
 * dropped the visitor onto Next's own error screen — a bare stack trace in
 * development, an unstyled "Application error" in production, with no way back
 * into the site.
 *
 * It sits inside `app/[locale]/layout.tsx`, so the navbar, the footer and the
 * `NextIntlClientProvider` are all still mounted above it: `useTranslations`
 * works here, and the visitor keeps the site's navigation. An error in the
 * layout *itself* escapes to `app/global-error.tsx`, which is why that file
 * uses no provider and no translations.
 */
export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("error");

  useEffect(() => {
    // The only record of this. There is no error-tracking service wired up, so
    // the browser console and the Vercel function logs are where it lands.
    console.error("[public] Unhandled render error:", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-20">
      <div className="text-center max-w-md">
        <AlertTriangle size={36} className="mx-auto mb-5 text-accent" aria-hidden="true" />
        <h1 className="font-serif text-3xl text-earth-text mb-3">{t("title")}</h1>
        <p className="font-sans text-sm text-earth-text/70 mb-8">{t("body")}</p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {/* `reset()` re-renders the segment without a full page load, so a
              transient failure recovers without losing the visitor's place. */}
          <button type="button" onClick={reset} className="btn-primary px-6 py-3">
            {t("retry")}
          </button>
          <Link href="/" className="btn-outline px-6 py-3">
            {t("home")}
          </Link>
        </div>

        {/* Vercel's digest for this error. Useless to the visitor on its own,
            and the only thing that ties what they saw to a line in the logs
            when they get in touch. */}
        {error.digest && (
          <p className="mt-8 font-sans text-xs text-earth-text/70">
            {t("reference")}: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
