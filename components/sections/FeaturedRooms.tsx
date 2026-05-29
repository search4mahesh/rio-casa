import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Users, Star, Bath, BedDouble } from "lucide-react";

const featuredRooms = [
  {
    slug: "deluxe-room",
    name: "Deluxe Room",
    tagline: "Comfort in the hills",
    price: 4500,
    maxGuests: 2,
    badge: null,
    rating: 4.8,
    image: "/images/rooms/deluxe-main.jpg",
    imageAlt: "Deluxe Room with wood ceiling and double bed",
  },
  {
    slug: "premium-room",
    name: "Premium Room",
    tagline: "With soaking bathtub",
    price: 6500,
    maxGuests: 2,
    badge: "Bathtub",
    rating: 4.9,
    image: "/images/rooms/premium-bed.jpg",
    imageAlt: "Premium Room with upholstered headboard",
  },
  {
    slug: "family-room",
    name: "Family Room",
    tagline: "2 double beds · Up to 4 guests",
    price: 7500,
    maxGuests: 4,
    badge: "Family Pick",
    rating: 4.9,
    image: "/images/rooms/family-main.jpg",
    imageAlt: "Family Room with two double beds",
  },
];

export default function FeaturedRooms({ locale }: { locale: string }) {
  const t = useTranslations("home");
  const rooms = useTranslations("rooms");
  const prefix = "";

  return (
    <section className="py-20 bg-earth-bg">
      <div className="container-resort">
        <div className="text-center mb-12">
          <p className="section-subheading mb-2">{t("featuredRoomsSubtitle")}</p>
          <h2 className="section-heading">{t("featuredRoomsTitle")}</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {featuredRooms.map((room) => (
            <div
              key={room.slug}
              className="bg-earth-white rounded-sm overflow-hidden shadow-sm hover:shadow-md transition-shadow group flex flex-col"
            >
              {/* Image */}
              <div className="relative h-56 overflow-hidden">
                <Image
                  src={room.image}
                  alt={room.imageAlt}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-500"
                  sizes="(max-width: 768px) 100vw, 33vw"
                />
                {room.badge && (
                  <span className="absolute top-3 left-3 bg-accent text-white text-xs font-sans font-medium px-2.5 py-1 rounded-full flex items-center gap-1.5">
                    {room.badge === "Bathtub"     && <Bath     size={11} />}
                    {room.badge === "Family Pick" && <BedDouble size={11} />}
                    {room.badge}
                  </span>
                )}
              </div>

              <div className="p-5 flex flex-col flex-1">
                <div className="flex items-start justify-between mb-1">
                  <h3 className="font-serif text-xl text-earth-text">{room.name}</h3>
                  <div className="flex items-center gap-1 text-accent shrink-0">
                    <Star size={14} fill="currentColor" />
                    <span className="font-sans text-xs">{room.rating}</span>
                  </div>
                </div>

                <p className="font-sans text-xs text-earth-text/50 italic mb-3">{room.tagline}</p>

                <div className="flex items-center gap-1 text-earth-text/60 text-sm mb-4">
                  <Users size={14} />
                  <span>{rooms("maxGuests", { count: room.maxGuests })}</span>
                </div>

                <div className="flex items-center justify-between mt-auto">
                  <div>
                    <span className="font-serif text-2xl text-primary">₹{room.price.toLocaleString("en-IN")}</span>
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
