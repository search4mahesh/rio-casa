import BookingWizard from "@/components/booking/BookingWizard";
import { useTranslations } from "next-intl";
import { pageMetadata } from "@/lib/page-metadata";

export const generateMetadata = () => pageMetadata("booking", "/booking");

export default function BookingPage({
  params,
  searchParams,
}: {
  params: { locale: string };
  // `/rooms` sends the dates the guest already chose there, so they are not
  // asked for them twice. Both are validated in the wizard before use — a
  // hand-typed `?checkIn=2026-02-30` must not become a broken date input.
  searchParams: { room?: string; checkIn?: string; checkOut?: string };
}) {
  const t = useTranslations("booking");

  return (
    <div className="min-h-screen bg-earth-bg py-16">
      {/* Razorpay script */}
      <script src="https://checkout.razorpay.com/v1/checkout.js" async />

      <div className="container-resort">
        <div className="text-center mb-12">
          <h1 className="section-heading">{t("title")}</h1>
        </div>
        <BookingWizard
          locale={params.locale}
          preselectedSlug={searchParams.room}
          initialCheckIn={searchParams.checkIn}
          initialCheckOut={searchParams.checkOut}
        />
      </div>
    </div>
  );
}
