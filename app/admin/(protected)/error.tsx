"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

/**
 * Error boundary for the admin panel.
 *
 * Panels already handle *fetch* failures — `apiJson` cannot throw, and
 * `ErrorState` gives a failed load a message and a retry (B-39). Nothing
 * caught a failure in the **render**, though, and an admin page is mostly
 * server-rendered data: a booking with an unexpected shape, a null where a
 * room was expected, a date that will not format. Those took out the whole
 * panel with Next's default screen and no way back to the sidebar.
 *
 * It sits inside `app/admin/(protected)/layout.tsx`, so the sidebar and the
 * session gate are still above it — staff keep their navigation and stay
 * signed in.
 *
 * Not translated: `messages/en.json` is the *public* site's copy, and no admin
 * panel reads it. The strings rule is about visitor-facing text living in one
 * file, and the admin panel has always been written in place.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[admin] Unhandled render error:", error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[70vh] p-6">
      <div className="text-center max-w-md">
        <AlertTriangle size={32} className="mx-auto mb-4 text-accent" aria-hidden="true" />
        <h1 className="text-lg font-semibold text-gray-900 mb-2">This page could not be shown</h1>
        <p className="text-sm text-gray-600 mb-6">
          Something went wrong rendering it. Nothing has been changed — trying again is safe.
        </p>

        <div className="flex flex-wrap gap-3 justify-center">
          <button type="button" onClick={reset} className="btn-admin px-4 py-2">
            Try again
          </button>
          <Link
            href="/admin/dashboard"
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Back to Today
          </Link>
        </div>

        {/* Staff read this one out when reporting a problem — it is what ties
            the screen they saw to a line in the Vercel logs. */}
        {error.digest && (
          <p className="mt-8 text-xs text-gray-400">Reference: {error.digest}</p>
        )}
      </div>
    </div>
  );
}
