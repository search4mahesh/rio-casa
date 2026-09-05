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
import { CONTENT_REVALIDATE_SECONDS } from "@/lib/content-cache";
import { addDays, today, toDayString } from "@/lib/dates";

// Revalidated on a timer rather than read per visitor. `force-dynamic` was
// the right correction to B-74 (this page was prerendered at build, so the approved testimonials and the catalogue's price range
// went stale until the next deploy) but it made every visitor pay a database
// round trip — and, on a property this quiet, often the ~1.9s connection
// handshake that follows an idle pool. A minute is the window; see
// `lib/content-cache.ts` for why the floor is time and not tags.
export const revalidate = CONTENT_REVALIDATE_SECONDS;

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
      {/* The earliest bookable check-in, resolved on the server. `today()`
          answers in the property's timezone; computing it inside the hero's
          client island would run it twice — once server-side, once on
          hydration — and disagree either side of IST midnight. */}
      <Hero minCheckIn={toDayString(addDays(today(), 1))} />
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
          // A string, not a Date — `getTestimonials` is cached, and Next’s
          // data cache hands back JSON. See SiteTestimonial.stayDate.
          stayDate: x.stayDate
            ? new Date(x.stayDate).toLocaleDateString("en-IN", {
                month: "long",
                year: "numeric",
                timeZone: "UTC",
              })
            : null,
        }))}
      />
      <LocationSection />
    </>
  );
}
