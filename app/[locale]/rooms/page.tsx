import { getTranslations } from "next-intl/server";
import Link from "next/link";
import Image from "next/image";
import { Users, Star, Bath, BedDouble } from "lucide-react";
import { getRoomCategories } from "@/lib/room-catalogue";
import { pageMetadata } from "@/lib/page-metadata";

export const generateMetadata = () => pageMetadata("rooms");

export const dynamic = "force-dynamic";

export default async function RoomsPage() {
  const t = await getTranslations("rooms");
  // Live inventory — see lib/room-catalogue.ts. This list used to be hardcoded
  // and had drifted into advertising a room type the property does not own,
  // while never mentioning the four Standard rooms.
  const rooms = await getRoomCategories();

  return (
    <div className="py-16 bg-earth-bg min-h-screen">
      <div className="container-resort">
        <div className="text-center mb-14">
          <p className="section-subheading mb-2">{t("subtitle")}</p>
          <h1 className="section-heading">{t("title")}</h1>
          <p className="font-sans text-earth-text/60 mt-3 max-w-xl mx-auto text-sm">
            All rooms include extra bed on request (charges apply). Check-in 12:00 PM · Check-out 11:00 AM.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {rooms.map((room) => (
            <div
              key={room.slug}
              className="bg-earth-white rounded-sm shadow-sm overflow-hidden hover:shadow-md transition-shadow flex flex-col"
            >
              {/* Image */}
              <div className="relative h-56 overflow-hidden group">
                <Image
                  src={room.marketing.heroImage}
                  alt={room.marketing.heroAlt}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-500"
                  sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                />
                {room.marketing.highlight && (
                  <span className="absolute top-3 left-3 bg-accent text-white text-xs font-sans font-medium px-2.5 py-1 rounded-full flex items-center gap-1.5 z-10">
                    {room.marketing.highlight === "Bathtub" && <Bath size={11} />}
                    {room.marketing.highlight === "2 Double Beds" && <BedDouble size={11} />}
                    {room.marketing.highlight}
                  </span>
                )}
              </div>

              <div className="p-6 flex flex-col flex-1">
                <div className="flex items-start justify-between mb-2">
                  <h2 className="font-serif text-2xl text-earth-text">{room.name}</h2>
                  <div className="flex items-center gap-1 text-accent shrink-0">
                    <Star size={14} fill="currentColor" />
                    <span className="font-sans text-sm">{room.marketing.rating}</span>
                    <span className="text-earth-text/40 text-xs">({room.marketing.reviews})</span>
                  </div>
                </div>

                <p className="font-sans text-sm text-earth-text/70 mb-4 leading-relaxed flex-1">
                  {room.description}
                </p>

                <div className="flex flex-wrap gap-2 mb-5">
                  {room.amenities.map((amenity) => (
                    <span key={amenity} className="font-sans text-xs bg-primary/5 text-primary px-2.5 py-1 rounded-full">
                      {amenity}
                    </span>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-primary/10">
                  <div className="flex items-center gap-4">
                    <div>
                      <span className="font-serif text-2xl text-primary">
                        ₹{room.pricePerNight.toLocaleString("en-IN")}
                      </span>
                      <span className="font-sans text-xs text-earth-text/50 ml-1">{t("perNight")}</span>
                    </div>
                    <div className="flex items-center gap-1 text-earth-text/50 text-sm">
                      <Users size={14} />
                      <span>{t("maxGuests", { count: room.maxGuests })}</span>
                    </div>
                  </div>
                  <Link href={`/rooms/${room.slug}`} className="btn-primary text-sm py-2 px-5">
                    {t("bookRoom")}
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
