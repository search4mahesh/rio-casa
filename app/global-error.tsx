"use client";

import { useEffect } from "react";

/**
 * The last boundary — it catches errors thrown by the **root layout itself**,
 * which every other `error.tsx` sits inside and therefore cannot catch.
 *
 * Because it replaces the root layout, it has to render its own `<html>` and
 * `<body>`, and it runs with nothing above it: no `NextIntlClientProvider`, so
 * no `useTranslations`; no `globals.css` guarantee, since a failure in the
 * layout is exactly when the stylesheet may not have been applied. Everything
 * here is therefore plain English and inline styles — the one place in this
 * codebase where both rules are off, because the machinery that enforces them
 * is what has just failed.
 *
 * Deliberately minimal. Whatever broke, this has to render.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global] Root layout error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          backgroundColor: "#F5F0E8",
          color: "#2C2416",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
          textAlign: "center",
        }}
      >
        <main style={{ maxWidth: "26rem" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: "0 0 0.75rem" }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: "0.9rem", lineHeight: 1.6, opacity: 0.75, margin: "0 0 1.75rem" }}>
            Rio Casa&rsquo;s website ran into a problem. Please try again in a moment.
          </p>

          <button
            type="button"
            onClick={reset}
            style={{
              backgroundColor: "#4A6741",
              color: "#FDFAF5",
              border: "none",
              borderRadius: "2px",
              padding: "0.75rem 1.5rem",
              fontSize: "0.9rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try again
          </button>

          {error.digest && (
            <p style={{ marginTop: "2rem", fontSize: "0.75rem", opacity: 0.4 }}>
              Reference: {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
