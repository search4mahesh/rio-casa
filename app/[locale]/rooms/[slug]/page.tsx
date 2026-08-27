import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Users, Star, ArrowLeft, Check, Bath, BedDouble, Wifi, Tv, Wind, Droplets } from "lucide-react";
import { getRoomCategory } from "@/lib/room-catalogue";
import { isDayString } from "@/lib/dates";
import { absoluteUrl } from "@/lib/site-url";
import JsonLd from "@/components/seo/JsonLd";
import { roomSchema, breadcrumbSchema } from "@/lib/structured-data";

export const dynamic = "force-dynamic";

/**
 * Resolved from the same live inventory the page renders, so a room type that
 * does not exist gets the not-found title rather than the site default. The
 * brand is appended by the template in app/layout.tsx — do not repeat it here
 * (B-52).
 */
export async function generateMetadata({ params }: { params: { slug: string } }) {
  const room = await getRoomCategory(params.slug);
  // No canonical for a room that does not exist — the page 404s, and a
  // canonical would invite it to be indexed anyway.
  if (!room) return { title: "Room not found", robots: { index: false } };

  const description = `${room.name} at Rio Casa, Mahabaleshwar — from ₹${room.pricePerNight.toLocaleString("en-IN")} per night, up to ${room.maxGuests} guests. Book direct.`;
  const path = `/rooms/${room.slug}`;

  return {
    title: room.name,
    description,
    // `?checkIn=&checkOut=` rides through on every link from /rooms, so
    // without this each date combination is a separate URL competing with the
    // room's own page for the same snippet.
    alternates: { canonical: path },
    openGraph: {
      url: absoluteUrl(path),
      title: `${room.name} | Rio Casa Mahabaleshwar`,
      description,
      images: [{ url: room.marketing.heroImage, alt: room.marketing.heroAlt }],
    },
  };
}

/** Amenity strings the DB uses → the icon that best represents them. */
const AMENITY_ICON: Record<string, "bath" | "wind" | "wifi" | "tv" | "water" | "bed"> = {
  Bathtub: "bath",
  AC: "wind",
  WiFi: "wifi",
  TV: "tv",
  "LED TV": "tv",
  "Hot Water": "water",
  "Extra Bed Available": "bed",
  "2 Double Beds": "bed",
};

export default async function RoomDetailPage({
  params,
  searchParams,
}: {
  params: { locale: string; slug: string };
  // Carried from /rooms so a guest who already picked dates there is not asked
  // again. Passed straight through to the wizard, which validates them.
  searchParams: { checkIn?: string; checkOut?: string };
}) {
  // Resolved against live inventory — see lib/room-catalogue.ts. This was a
  // hardcoded map, which is how /rooms/premium-room served a bookable page for
  // a room type the property does not have.
  const room = await getRoomCategory(params.slug);
  if (!room) notFound();

  const t = await getTranslations("rooms");

  // Up to four amenities we have an icon for, shown as quick highlights.
  // Only a complete, real pair is forwarded. Half a range, or a day that does
  // not exist, is left off entirely so the wizard falls back to its defaults
  // rather than opening on a blank date input.
  const { checkIn, checkOut } = searchParams;
  const carryDates =
    checkIn && checkOut && isDayString(checkIn) && isDayString(checkOut) && checkOut > checkIn;
  const bookHref = carryDates
    ? `/booking?room=${room.slug}&checkIn=${checkIn}&checkOut=${checkOut}`
    : `/booking?room=${room.slug}`;

  const highlights = room.amenities
    .filter((a) => AMENITY_ICON[a])
    .slice(0, 4)
    .map((a) => ({ label: a, icon: AMENITY_ICON[a] }));

  return (
    <div className="py-16 bg-earth-bg min-h-screen">
      {/* The offer a search result can quote: the category's *minimum* nightly
          rate, which is the figure the card shows and one a guest can actually
          get. `containedInPlace` ties it to the Resort node on the home page,
          so the two are one graph rather than two unrelated claims. */}
      <JsonLd
        data={[
          roomSchema(room),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Rooms", path: "/rooms" },
            { name: room.name, path: `/rooms/${room.slug}` },
          ]),
        ]}
      />
      <div className="container-resort">
        {/* Back link */}
        <Link href="/rooms" className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80 mb-8 font-sans">
          <ArrowLeft size={16} />
          Back to Rooms
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Images */}
          <div>
            <div className="relative h-80 rounded-sm overflow-hidden mb-3">
              <Image
                src={room.marketing.heroImage}
                alt={room.marketing.heroAlt}
                fill
                priority
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              {room.marketing.gallery.map((thumb) => (
                <div key={thumb.src} className="relative h-24 rounded-sm overflow-hidden">
                  <Image
                    src={thumb.src}
                    alt={thumb.alt}
                    fill
                    className="object-cover hover:scale-105 transition-transform duration-300"
                    sizes="(max-width: 1024px) 33vw, 17vw"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Details */}
          <div>
            <div className="flex items-start justify-between mb-1">
              <h1 className="font-serif text-3xl text-earth-text">{room.name}</h1>
              <div className="flex items-center gap-1 text-accent shrink-0">
                <Star size={16} fill="currentColor" />
                <span className="font-sans font-semibold">{room.marketing.rating}</span>
                <span className="text-earth-text/70 text-sm">({room.marketing.reviews} reviews)</span>
              </div>
            </div>

            <p className="font-sans text-sm text-earth-text/70 italic mb-4">
              {room.count} {room.count === 1 ? "room" : "rooms"} of this type
            </p>

            <div className="flex items-center gap-4 text-earth-text/70 text-sm mb-6">
              <div className="flex items-center gap-1.5">
                <Users size={15} />
                <span>{t("maxGuests", { count: room.maxGuests })}</span>
              </div>
              {room.extraBed && (
                <div className="flex items-center gap-1.5 text-accent">
                  <BedDouble size={15} />
                  <span>Extra bed available</span>
                </div>
              )}
            </div>

            <p className="font-sans text-earth-text/70 leading-relaxed mb-6">
              {room.marketing.longDescription}
            </p>

            {/* Quick highlights */}
            {highlights.length > 0 && (
              <div className="grid grid-cols-2 gap-3 mb-6">
                {highlights.map((h) => (
                  <div key={h.label} className="flex items-center gap-2.5 bg-earth-white rounded-sm px-3 py-2.5">
                    {h.icon === "bath" && <Bath size={16} className="text-primary shrink-0" />}
                    {h.icon === "wind" && <Wind size={16} className="text-primary shrink-0" />}
                    {h.icon === "wifi" && <Wifi size={16} className="text-primary shrink-0" />}
                    {h.icon === "tv" && <Tv size={16} className="text-primary shrink-0" />}
                    {h.icon === "water" && <Droplets size={16} className="text-primary shrink-0" />}
                    {h.icon === "bed" && <BedDouble size={16} className="text-primary shrink-0" />}
                    <span className="font-sans text-sm text-earth-text/80">{h.label}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Full amenities */}
            <div className="mb-8">
              <h3 className="font-serif text-lg text-earth-text mb-3">{t("amenities")}</h3>
              <div className="grid grid-cols-2 gap-2">
                {room.amenities.map((amenity) => (
                  <div key={amenity} className="flex items-center gap-2 text-sm text-earth-text/70">
                    <Check size={14} className="text-primary shrink-0" />
                    <span>{amenity}</span>
                  </div>
                ))}
              </div>

              {/* Amenities only some rooms of this type have. Listed apart from
                  the guaranteed ones so the page cannot imply they come as
                  standard — a forest view on one of four standard rooms was
                  being advertised as if every guest got one (B-55). */}
              {room.someRoomsAmenities.length > 0 && (
                <div className="mt-4 pt-4 border-t border-primary/10">
                  <p className="font-sans text-xs text-earth-text/70 mb-2">{t("someRoomsAmenities")}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {room.someRoomsAmenities.map((amenity) => (
                      <div key={amenity} className="flex items-center gap-2 text-sm text-earth-text/70">
                        <Check size={14} className="text-earth-text/70 shrink-0" />
                        <span>{amenity}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Pricing + CTA */}
            <div className="bg-earth-white rounded-sm p-6 shadow-sm">
              <div className="flex items-baseline justify-between mb-1">
                <div>
                  <span className="font-serif text-3xl text-primary">
                    ₹{room.pricePerNight.toLocaleString("en-IN")}
                  </span>
                  <span className="font-sans text-sm text-earth-text/70 ml-2">{t("perNight")}</span>
                </div>
                <span className="font-sans text-xs text-earth-text/70">+taxes</span>
              </div>
              <p className="font-sans text-xs text-earth-text/70 mb-4">Extra bed charges apply on request</p>
              <Link href={bookHref} className="btn-primary w-full text-center block">
                {t("bookRoom")}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
