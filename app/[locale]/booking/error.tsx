"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertTriangle, MessageCircle } from "lucide-react";

/**
 * Error boundary for the booking flow specifically.
 *
 * The generic public one would do the job, but this is the one page where a
 * failure costs the property a booking, and where the visitor's first thought
 * is "have I just been charged?". So it says so, and it offers a way to
 * complete the booking that does not depend on the thing that just broke.
 *
 * The reassurance is accurate rather than comforting: Razorpay is only ever
 * opened by `handleSubmit` after `/api/booking/create` returns an order, and a
 * render error here means the wizard never got that far. A booking committed
 * but unpaid is released by `expireStalePaymentHolds()` within
 * `BOOKING_HOLD_MINUTES` either way.
 */
export default function BookingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("error");

  useEffect(() => {
    console.error("[booking] Unhandled render error in the booking flow:", error);
  }, [error]);

  // Same source as components/layout/WhatsAppButton.tsx.
  const phone = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;
  const waUrl = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(
        "Hi! I was trying to book a room at Rio Casa and the website ran into a problem. Could you help me book?"
      )}`
    : null;

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-20">
      <div className="text-center max-w-md">
        <AlertTriangle size={36} className="mx-auto mb-5 text-accent" aria-hidden="true" />
        <h1 className="font-serif text-3xl text-earth-text mb-3">{t("bookingTitle")}</h1>
        <p className="font-sans text-sm text-earth-text/70 mb-8">{t("bookingBody")}</p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button type="button" onClick={reset} className="btn-primary px-6 py-3">
            {t("retry")}
          </button>

          {/* Only rendered when there is a real number to reach. Offering a
              "call us" button that goes to the placeholder number would send a
              guest mid-booking to a stranger. */}
          {waUrl && (
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-outline px-6 py-3 inline-flex items-center justify-center gap-2"
            >
              <MessageCircle size={16} aria-hidden="true" />
              {t("bookingCall")}
            </a>
          )}
        </div>

        <p className="mt-6">
          <Link href="/rooms" className="font-sans text-sm text-primary hover:underline">
            {t("notFoundRooms")}
          </Link>
        </p>

        {error.digest && (
          <p className="mt-8 font-sans text-xs text-earth-text/70">
            {t("reference")}: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
