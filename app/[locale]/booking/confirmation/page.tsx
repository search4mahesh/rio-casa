import Link from "next/link";
import { CheckCircle, QrCode, SearchX, XCircle } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { pageMetadata } from "@/lib/page-metadata";
import { PROPERTY } from "@/lib/property";

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
            <h1 className="section-heading mb-4">Complete Your Payment</h1>
            <p className="font-sans text-earth-text/70 mb-8">
              Scan the QR code below with any UPI app to complete your booking.
            </p>
            <div className="bg-earth-white rounded-sm shadow-sm p-8 mb-8 inline-block">
              {/* Static UPI QR — replace /public/upi-qr.png with actual QR */}
              <div className="w-48 h-48 bg-primary-100 flex items-center justify-center text-primary-400 text-sm mx-auto">
                UPI QR Code
              </div>
              <p className="font-sans text-sm text-earth-text/70 mt-3">UPI ID: {PROPERTY.upiId}</p>
              <p className="font-serif text-lg text-primary mt-1">
                Amount: ₹{amount.toLocaleString("en-IN")}
              </p>
            </div>
            <p className="font-sans text-sm text-earth-text/70 mb-8">
              After payment, WhatsApp us the screenshot at {PROPERTY.phone} and we will confirm your booking within 15 minutes.
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

  return (
    <div className="flex flex-col sm:flex-row gap-3 justify-center">
      <Link href="/" className="btn-outline">
        Back to Home
      </Link>
      <a
        href={`https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "919876543210"}?text=${encodeURIComponent(message)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-primary"
      >
        WhatsApp Us
      </a>
    </div>
  );
}
