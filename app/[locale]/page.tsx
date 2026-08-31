import JsonLd from "@/components/seo/JsonLd";
import { PROPERTY } from "@/lib/property";
import { getRoomCategories } from "@/lib/room-catalogue";
import { getTestimonials } from "@/lib/site-content";
import { hotelSchema } from "@/lib/structured-data";
import Hero from "@/components/sections/Hero";
import AmenitiesStrip from "@/components/sections/AmenitiesStrip";
import FeaturedRooms from "@/components/sections/FeaturedRooms";
import PropertyGallery from "@/components/sections/PropertyGallery";
import Testimonials from "@/components/sections/Testimonials";
import LocationSection from "@/components/sections/LocationSection";

export default async function HomePage({ params }: { params: { locale: string } }) {
  // The graph carries a price range and an amenity list, both derived from the
  // live catalogue rather than written down here — so what Google shows is
  // what checkout charges. A database failure must not take the home page
  // down for it, so the schema is simply omitted.
  // Approved testimonials, read here so the carousel below can stay a client
  // component. A failed load renders the section empty rather than taking the
  // home page down over three quotes.
  let testimonials: Awaited<ReturnType<typeof getTestimonials>> = [];
  try {
    testimonials = await getTestimonials(6);
  } catch (err) {
    console.error("[home] Could not load testimonials.", err);
  }

  let hotel: object | null = null;
  try {
    hotel = hotelSchema({
      categories: await getRoomCategories(),
      address: PROPERTY.address,
      phone: PROPERTY.phone,
      email: PROPERTY.email,
      description: PROPERTY.schemaDescription,
    });
  } catch (err) {
    console.error("[home] Could not build hotel structured data.", err);
  }

  return (
    <>
      {hotel && <JsonLd data={hotel} />}
      <Hero locale={params.locale} />
      <AmenitiesStrip />
      <FeaturedRooms locale={params.locale} />
      <PropertyGallery />
      <Testimonials
        testimonials={testimonials.map((x) => ({
          id: x.id,
          guestName: x.guestName,
          location: x.location,
          review: x.review,
          rating: x.rating,
          stayDate: x.stayDate
            ? x.stayDate.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })
            : null,
        }))}
      />
      <LocationSection />
    </>
  );
}
