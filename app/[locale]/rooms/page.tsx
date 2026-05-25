import { useTranslations } from "next-intl";
import Link from "next/link";
import { Users, Star } from "lucide-react";

const rooms = [
  {
    slug: "deluxe-garden-view",
    name: "Deluxe Garden View",
    description: "A beautifully appointed room overlooking our lush garden, with a king-size bed and all modern amenities.",
    price: 4500,
    maxGuests: 2,
    amenities: ["King Bed", "AC", "Hot Water", "Garden View", "Room Service", "Wi-Fi"],
    rating: 4.8,
    reviews: 42,
  },
  {
    slug: "premium-valley-suite",
    name: "Premium Valley Suite",
    description: "Spacious suite with panoramic valley views, a separate living area, and a private balcony.",
    price: 7500,
    maxGuests: 3,
    amenities: ["King Bed", "AC", "Balcony", "Valley View", "Mini Bar", "Room Service", "Wi-Fi"],
    rating: 4.9,
    reviews: 28,
  },
  {
    slug: "royal-hilltop-suite",
    name: "Royal Hilltop Suite",
    description: "Our crown jewel — the most luxurious suite with 360° hilltop views, a jacuzzi, and butler service.",
    price: 12000,
    maxGuests: 4,
    amenities: ["King + Twin Beds", "AC", "Jacuzzi", "360° View", "Butler Service", "Mini Bar", "Wi-Fi"],
    rating: 5.0,
    reviews: 15,
  },
  {
    slug: "classic-double-room",
    name: "Classic Double Room",
    description: "Cozy and comfortable double room — perfect for couples seeking a peaceful getaway.",
    price: 3200,
    maxGuests: 2,
    amenities: ["Double Bed", "AC", "Hot Water", "Room Service", "Wi-Fi"],
    rating: 4.7,
    reviews: 67,
  },
];

export default function RoomsPage({ params }: { params: { locale: string } }) {
  const t = useTranslations("rooms");
  const prefix = params.locale !== "en" ? `/${params.locale}` : "";

  return (
    <div className="py-16 bg-earth-bg min-h-screen">
      <div className="container-resort">
        <div className="text-center mb-14">
          <p className="section-subheading mb-2">{t("subtitle")}</p>
          <h1 className="section-heading">{t("title")}</h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {rooms.map((room) => (
            <div
              key={room.slug}
              className="bg-earth-white rounded-sm shadow-sm overflow-hidden hover:shadow-md transition-shadow"
            >
              {/* Image placeholder */}
              <div className="h-56 bg-primary-100 flex items-center justify-center text-primary-400 text-sm">
                Room Image — {room.name}
              </div>

              <div className="p-6">
                <div className="flex items-start justify-between mb-2">
                  <h2 className="font-serif text-2xl text-earth-text">{room.name}</h2>
                  <div className="flex items-center gap-1 text-accent shrink-0">
                    <Star size={14} fill="currentColor" />
                    <span className="font-sans text-sm">{room.rating}</span>
                    <span className="text-earth-text/40 text-xs">({room.reviews})</span>
                  </div>
                </div>

                <p className="font-sans text-sm text-earth-text/70 mb-4 leading-relaxed">
                  {room.description}
                </p>

                <div className="flex flex-wrap gap-2 mb-5">
                  {room.amenities.map((amenity) => (
                    <span
                      key={amenity}
                      className="font-sans text-xs bg-primary-50 text-primary px-2.5 py-1 rounded-full"
                    >
                      {amenity}
                    </span>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-primary-50">
                  <div className="flex items-center gap-4">
                    <div>
                      <span className="font-serif text-2xl text-primary">
                        ₹{room.price.toLocaleString("en-IN")}
                      </span>
                      <span className="font-sans text-xs text-earth-text/50 ml-1">
                        {t("perNight")}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-earth-text/50 text-sm">
                      <Users size={14} />
                      <span>{t("maxGuests", { count: room.maxGuests })}</span>
                    </div>
                  </div>
                  <Link
                    href={`${prefix}/rooms/${room.slug}`}
                    className="btn-primary text-sm py-2 px-5"
                  >
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
