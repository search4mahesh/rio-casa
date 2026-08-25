"use client";

import { AlertTriangle } from "lucide-react";

// ─────────────────────────────────────────────────────────────
// What a panel shows when its data could not be loaded.
//
// Without this a failed load fell through to the panel's *empty* state —
// "No promo codes yet", "No expenses this month" — which is a different
// claim entirely: it tells staff the property has no data when in fact we
// never managed to ask. One says "nothing here", the other says "we do not
// know", and only the second one is true after a failed fetch.
//
// Pair it with `apiFetch` in lib/api-client.ts, which is what makes the
// failure reachable instead of leaving the panel on "Loading…" forever.
// ─────────────────────────────────────────────────────────────

export function ErrorState({
  message,
  onRetry,
  className = "py-16",
}: {
  message: string;
  /** Omit for a panel with nothing sensible to retry. */
  onRetry?: () => void;
  /** Vertical rhythm varies between panels — match the one it replaces. */
  className?: string;
}) {
  return (
    <div className={`text-center ${className}`}>
      <AlertTriangle size={28} className="mx-auto mb-3 text-accent" aria-hidden="true" />
      <p className="text-sm text-gray-600 mb-4 max-w-sm mx-auto">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-admin px-4 py-2">
          Try again
        </button>
      )}
    </div>
  );
}
