import Link from "next/link";
import { CheckCircle, QrCode, SearchX, XCircle } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { pageMetadata } from "@/lib/page-metadata";
import { PROPERTY } from "@/lib/property";
import { whatsappUrl } from "@/lib/whatsapp";
import { BOOKING_HOLD_MINUTES } from "@/lib/booking-service";

export const generateMetadata = () => pageMetadata("confirmation");

export const dynamic = "force-dynamic";

/**
 * This page used to render "Booking Confirmed!" for whatever `id` was in the
 * URL — it never looked the booking up, so a typo, a stale link, or a payment
 * that failed after redirect all produced a convincing confirmation screen and
 * no actual details. Load the booking and only claim success if it exists.
 */
export default async function BookingConfirmationPage({
  searchParams,
}: {
  params: { locale: string };
  searchParams: { id?: string; method?: string };
}) {
  const t = await getTranslations("booking");
  const isUpi = searchParams.method === "upi";

  const booking = searchParams.id
    ? await prisma.booking.findUnique({
        where: { id: searchParams.id },
        select: {
          bookingNumber: true,
          guestName: true,
          checkIn: true,
          checkOut: true,
          nights: true,
          adults: true,
          children: true,
          totalAmount: true,
          discountAmount: true,
          status: true,
          paymentStatus: true,
          room: { select: { name: true, roomNumber: true } },
        },
      })
    : null;

  if (!booking) {
    return (
      <div className="min-h-screen bg-earth-bg py-20">
        <div className="container-resort max-w-lg text-center">
          <SearchX size={56} className="text-accent mx-auto mb-4" />
          <h1 className="section-heading mb-4">We could not find that booking</h1>
          <p className="font-sans text-earth-text/70 mb-8">
            The link may be incomplete or out of date. If you have been charged, message us
            and we will confirm your booking straight away — please do not pay again.
          </p>
          <ConfirmationActions reference={searchParams.id} />
        </div>
      </div>
    );
  }

  const amount = Number(booking.totalAmount);
  const guests = booking.adults + booking.children;

  // `am` is a plain decimal, never a locale-formatted string — "4,500" is not
  // an amount any UPI app will parse. The note carries the booking number so
  // an incoming transfer can be matched to a reservation without asking.
  const upiUrl =
    `upi://pay?pa=${encodeURIComponent(PROPERTY.upiId)}` +
    `&pn=${encodeURIComponent(PROPERTY.billingName)}` +
    `&am=${amount.toFixed(2)}&cu=INR` +
    `&tn=${encodeURIComponent(booking.bookingNumber)}`;

  // A stale hold or a failed payment leaves the booking `cancelled` — the
  // room is already back on the calendar for someone else. Checking only
  // `paymentStatus` here (both "pending" and this booking's "failed" satisfy
  // `!== "paid"`) rendered the same "Confirmed" / "still pending" copy for a
  // booking that will never be confirmed, which is worse than no page at all.
  if (booking.status === "cancelled") {
    return (
      <div className="min-h-screen bg-earth-bg py-20">
        <div className="container-resort max-w-lg text-center">
          <XCircle size={56} className="text-accent mx-auto mb-4" />
          <h1 className="section-heading mb-4">This booking did not go through</h1>
          <p className="font-sans text-earth-text/70 mb-8">
            Booking {booking.bookingNumber} was cancelled and the room has been released. If you
            have already been charged, message us with the booking number below and we will sort
            it out right away — please do not pay again.
          </p>
          <div className="bg-earth-white rounded-sm shadow-sm p-6 mb-8 text-left font-sans text-sm space-y-2">
            <Row label="Booking number" value={<span className="font-mono">{booking.bookingNumber}</span>} />
            <Row label="Guest" value={booking.guestName} />
            <Row label="Room" value={`#${booking.room.roomNumber} — ${booking.room.name}`} />
            <Row label={t("checkIn")} value={format(booking.checkIn, "dd MMM yyyy")} />
            <Row label={t("checkOut")} value={format(booking.checkOut, "dd MMM yyyy")} />
          </div>
          <ConfirmationActions reference={booking.bookingNumber} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-earth-bg py-20">
      <div className="container-resort max-w-lg text-center">
        {isUpi ? (
          <>
            <QrCode size={56} className="text-primary mx-auto mb-4" />
            <h1 className="section-heading mb-4">{t("upiTitle")}</h1>
            {/* The real hold window, not an invented one. This line used to
                promise confirmation "within 15 minutes" while
                `expireStalePaymentHolds()` swept the booking at
                BOOKING_HOLD_MINUTES — 60 by default — so the only number the
                guest was given was the one number that was not true. */}
            <p className="font-sans text-earth-text/70 mb-8">
              {t("upiHold", { minutes: BOOKING_HOLD_MINUTES })}
            </p>

            <div className="bg-earth-white rounded-sm shadow-sm p-6 mb-8 text-left">
              {/* A `upi:` deep link, not a QR code. This screen is reached on
                  the phone the guest is holding, and a QR rendered on that
                  same screen is the one thing that phone cannot scan — which
                  is why the placeholder box that sat here for so long was
                  never actually missed. The link hands the payee, the amount
                  and the reference straight to GPay, PhonePe or Paytm, so
                  there is nothing left to mistype. */}
              <a href={upiUrl} className="btn-primary w-full text-center block">
                {t("upiPayNow", { amount: amount.toLocaleString("en-IN") })}
              </a>
              <p className="font-sans text-xs text-earth-text/70 mt-2 text-center">
                {t("upiOnThisPhone")}
              </p>

              {/* The same details in a form a desktop visitor can use, since
                  the deep link does nothing on a machine with no UPI app. */}
              <div className="border-t border-primary-200 mt-5 pt-4 font-sans text-sm space-y-1">
                <p className="text-earth-text/70">{t("upiManualHeading")}</p>
                <p className="font-mono text-earth-text break-all">{PROPERTY.upiId}</p>
                <p className="font-serif text-lg text-primary">
                  ₹{amount.toLocaleString("en-IN")}
                </p>
                <p className="text-earth-text/70 text-xs pt-1">
                  {t("upiReference", { reference: booking.bookingNumber })}
                </p>
              </div>
            </div>

            <p className="font-sans text-sm text-earth-text/70 mb-8">
              {/* WhatsApp is only offered when a number is configured — same
                  rule as `ConfirmationActions` below (B-73). With none, the
                  phone number is the way to reach the property. */}
              {whatsappUrl("") ? t("upiAfterWhatsApp") : t("upiAfterPhone", { phone: PROPERTY.phone })}
            </p>
          </>
        ) : (
          <>
            <CheckCircle size={56} className="text-primary mx-auto mb-4" />
            <h1 className="section-heading mb-4">{t("success")}</h1>
            <p className="font-sans text-earth-text/70 mb-8">{t("confirmationSent")}</p>
          </>
        )}

        <div className="bg-earth-white rounded-sm shadow-sm p-6 mb-8 text-left font-sans text-sm space-y-2">
          <Row label="Booking number" value={<span className="font-mono">{booking.bookingNumber}</span>} />
          <Row label="Guest" value={booking.guestName} />
          <Row label="Room" value={`#${booking.room.roomNumber} — ${booking.room.name}`} />
          <Row label={t("checkIn")} value={format(booking.checkIn, "dd MMM yyyy")} />
          <Row label={t("checkOut")} value={format(booking.checkOut, "dd MMM yyyy")} />
          {/* `nights` is "{count} nights" — it needs the param, or next-intl
              renders the raw key path to the guest. */}
          <Row label={t("duration")} value={t("nights", { count: booking.nights })} />
          <Row label={t("guests")} value={String(guests)} />
          {booking.discountAmount > 0 && (
            <Row
              label="Discount"
              value={<span className="text-primary">−₹{Number(booking.discountAmount).toLocaleString("en-IN")}</span>}
            />
          )}
          <div className="border-t border-primary-200 pt-2 mt-2 flex justify-between font-semibold text-primary text-base">
            <span>{t("totalAmount")}</span>
            <span>₹{amount.toLocaleString("en-IN")}</span>
          </div>
          {booking.paymentStatus !== "paid" && (
            <p className="text-accent text-xs pt-1">
              Payment is still pending — we will confirm as soon as it clears.
            </p>
          )}
        </div>

        <ConfirmationActions reference={booking.bookingNumber} />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-earth-text/70">{label}</span>
      <span className="text-earth-text text-right">{value}</span>
    </div>
  );
}

function ConfirmationActions({ reference }: { reference?: string }) {
  const message = reference
    ? `Hi! I just made a booking at ${PROPERTY.name}. Booking reference: ${reference}`
    : `Hi! I just made a booking at ${PROPERTY.name} and need help confirming it.`;

  // Rendered only when a number is configured. The fallback that used to sit
  // here sent a guest's booking reference to a stranger's phone (B-73).
  const waUrl = whatsappUrl(message);

  return (
    <div className="flex flex-col sm:flex-row gap-3 justify-center">
      <Link href="/" className="btn-outline">
        Back to Home
      </Link>
      {waUrl && (
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary"
        >
          WhatsApp Us
        </a>
      )}
    </div>
  );
}
