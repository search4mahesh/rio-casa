import Link from "next/link";
import { CheckCircle, QrCode } from "lucide-react";
import { useTranslations } from "next-intl";

export default function BookingConfirmationPage({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams: { id?: string; method?: string };
}) {
  const t = useTranslations("booking");
  const prefix = "";
  const isUpi = searchParams.method === "upi";

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
              <p className="font-sans text-sm text-earth-text/60 mt-3">UPI ID: riocasa@paytm</p>
              <p className="font-serif text-lg text-primary mt-1">
                Amount: ₹{/* amount would be passed via URL */}–
              </p>
            </div>
            <p className="font-sans text-sm text-earth-text/50 mb-8">
              After payment, WhatsApp us the screenshot at +91 98765 43210 and we will confirm your booking within 15 minutes.
            </p>
          </>
        ) : (
          <>
            <CheckCircle size={56} className="text-primary mx-auto mb-4" />
            <h1 className="section-heading mb-4">{t("success")}</h1>
            <p className="font-sans text-earth-text/70 mb-2">{t("confirmationSent")}</p>
            <p className="font-sans text-sm text-earth-text/50 mb-8">
              Booking ID: <span className="font-mono text-primary">{searchParams.id}</span>
            </p>
          </>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href={`${prefix}/`} className="btn-outline">
            Back to Home
          </Link>
          <a
            href={`https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "919876543210"}?text=${encodeURIComponent("Hi! I just made a booking at Rio Casa. Booking ID: " + (searchParams.id ?? ""))}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary"
          >
            WhatsApp Us
          </a>
        </div>
      </div>
    </div>
  );
}
