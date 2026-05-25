import { useTranslations } from "next-intl";
import Hero from "@/components/sections/Hero";
import AmenitiesStrip from "@/components/sections/AmenitiesStrip";
import FeaturedRooms from "@/components/sections/FeaturedRooms";
import Testimonials from "@/components/sections/Testimonials";
import LocationSection from "@/components/sections/LocationSection";

export default function HomePage({ params }: { params: { locale: string } }) {
  return (
    <>
      <Hero locale={params.locale} />
      <AmenitiesStrip />
      <FeaturedRooms locale={params.locale} />
      <Testimonials />
      <LocationSection />
    </>
  );
}
