"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────
// Transient confirmation message for admin actions.
//
// Consolidates 13 hand-rolled copies that had drifted to three
// different dismiss delays (3000 / 3500 / 4000ms). Two behaviours
// the copies got wrong and this does not:
//
//   • a second toast used to be cut short by the *first* toast's
//     still-pending timer — the timer is now reset per message
//   • the timer is cleared on unmount, so it can't fire setState
//     against a component that has gone away
// ─────────────────────────────────────────────────────────────

const DEFAULT_DURATION_MS = 3500;

export function useToast(durationMs: number = DEFAULT_DURATION_MS) {
  const [toast, setToast] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(
    (message: string) => {
      if (timer.current) clearTimeout(timer.current);
      setToast(message);
      timer.current = setTimeout(() => setToast(""), durationMs);
    },
    [durationMs]
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  return { toast, showToast };
}

/**
 * Renders nothing when `message` is empty, so callers can drop it in
 * unconditionally. `className` appends extra utilities — the shifts roster
 * uses it for `print:hidden` so the toast stays off printed schedules.
 */
export function Toast({ message, className = "" }: { message: string; className?: string }) {
  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-6 right-6 bg-gray-900 text-white text-sm px-4 py-3 rounded-lg shadow-lg z-50 ${className}`}
    >
      {message}
    </div>
  );
}
