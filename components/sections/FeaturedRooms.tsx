import Link from "next/link";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Users, Star, Bath, BedDouble } from "lucide-react";
import { getRoomCategories } from "@/lib/room-catalogue";

export default async function FeaturedRooms({ locale }: { locale: string }) {
  const t = await getTranslations("home");
  const rooms = await getTranslations("rooms");
  const prefix = "";

  // Live inventory — see lib/room-catalogue.ts. This section used to carry its
  // own hardcoded room list, which drifted from what /rooms and the booking
  // wizard actually sell: wrong names, a "Premium Room" that does not exist,
  // and three "Book This Room" links that all 404'd. Same source as /rooms now,
  // so it cannot drift again.
  const categories = await getRoomCategories();

  return (
    <section className="py-20 bg-earth-bg">
      <div className="container-resort">
        <div className="text-center mb-12">
          <p className="section-subheading mb-2">{t("featuredRoomsSubtitle")}</p>
          <h2 className="section-heading">{t("featuredRoomsTitle")}</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {categories.map((room) => (
            <div
              key={room.slug}
              className="bg-earth-white rounded-sm overflow-hidden shadow-sm hover:shadow-md transition-shadow group flex flex-col"
            >
              {/* Image */}
              <div className="relative h-56 overflow-hidden">
                <Image
                  src={room.marketing.heroImage}
                  alt={room.marketing.heroAlt}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-500"
                  sizes="(max-width: 768px) 100vw, 33vw"
                />
                {room.marketing.highlight && (
                  <span className="absolute top-3 left-3 bg-accent text-white text-xs font-sans font-medium px-2.5 py-1 rounded-full flex items-center gap-1.5">
                    {room.marketing.highlight === "Bathtub" && <Bath size={11} />}
                    {room.marketing.highlight === "2 Double Beds" && <BedDouble size={11} />}
                    {room.marketing.highlight}
                  </span>
                )}
              </div>

              <div className="p-5 flex flex-col flex-1">
                <div className="flex items-start justify-between mb-1">
                  <h3 className="font-serif text-xl text-earth-text">{room.name}</h3>
                  <div className="flex items-center gap-1 text-accent shrink-0">
                    <Star size={14} fill="currentColor" />
                    <span className="font-sans text-xs">{room.marketing.rating}</span>
                  </div>
                </div>

                <p className="font-sans text-xs text-earth-text/50 italic mb-3">{room.marketing.tagline}</p>

                <div className="flex items-center gap-1 text-earth-text/60 text-sm mb-4">
                  <Users size={14} />
                  <span>{rooms("maxGuests", { count: room.maxGuests })}</span>
                </div>

                <div className="flex items-center justify-between mt-auto">
                  <div>
                    <span className="font-serif text-2xl text-primary">₹{room.pricePerNight.toLocaleString("en-IN")}</span>
                    <span className="font-sans text-xs text-earth-text/50 ml-1">{rooms("perNight")}</span>
                  </div>
                  <Link href={`${prefix}/rooms/${room.slug}`} className="btn-outline text-sm py-2 px-4">
                    {rooms("bookRoom")}
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-10">
          <Link href={`${prefix}/rooms`} className="btn-outline">View All Rooms</Link>
        </div>
      </div>
    </section>
  );
}
