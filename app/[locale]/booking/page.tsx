import BookingWizard from "@/components/booking/BookingWizard";
import { useTranslations } from "next-intl";

export default function BookingPage({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams: { room?: string };
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
        <BookingWizard locale={params.locale} preselectedSlug={searchParams.room} />
      </div>
    </div>
  );
}
