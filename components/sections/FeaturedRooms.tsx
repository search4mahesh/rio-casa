import Link from "next/link";
import { useTranslations } from "next-intl";
import { Users, Star } from "lucide-react";

const placeholderRooms = [
  {
    id: "1",
    slug: "deluxe-garden-view",
    name: "Deluxe Garden View",
    price: 4500,
    maxGuests: 2,
    image: "/images/room-1.jpg",
    rating: 4.8,
  },
  {
    id: "2",
    slug: "premium-valley-suite",
    name: "Premium Valley Suite",
    price: 7500,
    maxGuests: 3,
    image: "/images/room-2.jpg",
    rating: 4.9,
  },
  {
    id: "3",
    slug: "royal-hilltop-suite",
    name: "Royal Hilltop Suite",
    price: 12000,
    maxGuests: 4,
    image: "/images/room-3.jpg",
    rating: 5.0,
  },
];

export default function FeaturedRooms({ locale }: { locale: string }) {
  const t = useTranslations("home");
  const rooms = useTranslations("rooms");
  const prefix = `/${locale}`;

  return (
    <section className="py-20 bg-earth-bg">
      <div className="container-resort">
        <div className="text-center mb-12">
          <p className="section-subheading mb-2">{t("featuredRoomsSubtitle")}</p>
          <h2 className="section-heading">{t("featuredRoomsTitle")}</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {placeholderRooms.map((room) => (
            <div
              key={room.id}
              className="bg-earth-white rounded-sm overflow-hidden shadow-sm hover:shadow-md transition-shadow group"
            >
              <div className="relative h-56 overflow-hidden">
                <div className="absolute inset-0 bg-primary-200 flex items-center justify-center text-primary-400 text-sm">
                  {/* Placeholder until real images are added */}
                  Room Image
                </div>
              </div>

              <div className="p-5">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-serif text-xl text-earth-text">{room.name}</h3>
                  <div className="flex items-center gap-1 text-accent">
                    <Star size={14} fill="currentColor" />
                    <span className="font-sans text-xs">{room.rating}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1 text-earth-text/60 text-sm mb-4">
                  <Users size={14} />
                  <span>{rooms("maxGuests", { count: room.maxGuests })}</span>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-serif text-2xl text-primary">₹{room.price.toLocaleString("en-IN")}</span>
                    <span className="font-sans text-xs text-earth-text/50 ml-1">{rooms("perNight")}</span>
                  </div>
                  <Link
                    href={`${prefix}/rooms/${room.slug}`}
                    className="btn-outline text-sm py-2 px-4"
                  >
                    {rooms("bookRoom")}
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-10">
          <Link href={`${prefix}/rooms`} className="btn-outline">
            View All Rooms
          </Link>
        </div>
      </div>
    </section>
  );
}
