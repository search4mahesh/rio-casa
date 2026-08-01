import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Users, Star, ArrowLeft, Check, Bath, BedDouble, Wifi, Tv, Wind, Droplets } from "lucide-react";
import { getRoomCategory } from "@/lib/room-catalogue";

export const dynamic = "force-dynamic";

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

export default async function RoomDetailPage({ params }: { params: { locale: string; slug: string } }) {
  // Resolved against live inventory — see lib/room-catalogue.ts. This was a
  // hardcoded map, which is how /rooms/premium-room served a bookable page for
  // a room type the property does not have.
  const room = await getRoomCategory(params.slug);
  if (!room) notFound();

  const t = await getTranslations("rooms");

  // Up to four amenities we have an icon for, shown as quick highlights.
  const highlights = room.amenities
    .filter((a) => AMENITY_ICON[a])
    .slice(0, 4)
    .map((a) => ({ label: a, icon: AMENITY_ICON[a] }));

  return (
    <div className="py-16 bg-earth-bg min-h-screen">
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
                <span className="text-earth-text/40 text-sm">({room.marketing.reviews} reviews)</span>
              </div>
            </div>

            <p className="font-sans text-sm text-earth-text/50 italic mb-4">
              {room.count} {room.count === 1 ? "room" : "rooms"} of this type
            </p>

            <div className="flex items-center gap-4 text-earth-text/60 text-sm mb-6">
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
            </div>

            {/* Pricing + CTA */}
            <div className="bg-earth-white rounded-sm p-6 shadow-sm">
              <div className="flex items-baseline justify-between mb-1">
                <div>
                  <span className="font-serif text-3xl text-primary">
                    ₹{room.pricePerNight.toLocaleString("en-IN")}
                  </span>
                  <span className="font-sans text-sm text-earth-text/50 ml-2">{t("perNight")}</span>
                </div>
                <span className="font-sans text-xs text-earth-text/40">+taxes</span>
              </div>
              <p className="font-sans text-xs text-earth-text/50 mb-4">Extra bed charges apply on request</p>
              <Link href={`/booking?room=${room.slug}`} className="btn-primary w-full text-center block">
                {t("bookRoom")}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
