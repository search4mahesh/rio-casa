import { useTranslations } from "next-intl";
import Link from "next/link";
import Image from "next/image";
import { Users, Star, Bath, BedDouble } from "lucide-react";

const rooms = [
  {
    slug: "deluxe-room",
    name: "Deluxe Room",
    description: "A well-appointed room designed for comfort and relaxation. Perfect for couples or solo travellers seeking a peaceful Mahabaleshwar escape.",
    price: 4500,
    maxGuests: 2,
    extraBed: true,
    amenities: ["AC", "WiFi", "TV", "Hot Water", "Room Service"],
    highlight: null,
    count: 6,
    rating: 4.8,
    reviews: 94,
    image: "/images/rooms/deluxe-main.jpg",
    imageAlt: "Deluxe Room with wood ceiling and double bed",
  },
  {
    slug: "premium-room",
    name: "Premium Room",
    description: "An elevated room featuring a luxurious soaking bathtub. Unwind after a day of exploring Mahabaleshwar with a long, relaxing bath.",
    price: 6500,
    maxGuests: 2,
    extraBed: true,
    amenities: ["AC", "WiFi", "TV", "Hot Water", "Bathtub", "Premium Toiletries", "Room Service"],
    highlight: "Bathtub",
    count: 2,
    rating: 4.9,
    reviews: 36,
    image: "/images/rooms/premium-bed.jpg",
    imageAlt: "Premium Room with luxury bedding",
  },
  {
    slug: "family-room",
    name: "Family Room",
    description: "Our spacious family room fits the whole family comfortably with two double beds and a dedicated seating area — ideal for a Mahabaleshwar family holiday.",
    price: 7500,
    maxGuests: 4,
    extraBed: true,
    amenities: ["AC", "WiFi", "TV", "Hot Water", "2 Double Beds", "Seating Area", "Room Service"],
    highlight: "2 Double Beds",
    count: 1,
    rating: 4.9,
    reviews: 28,
    image: "/images/rooms/family-main.jpg",
    imageAlt: "Family Room with two double beds and balcony",
  },
];

export default function RoomsPage({ params }: { params: { locale: string } }) {
  const t = useTranslations("rooms");
  const prefix = "";

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
                  src={room.image}
                  alt={room.imageAlt}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-500"
                  sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                />
                {room.highlight && (
                  <span className="absolute top-3 left-3 bg-accent text-white text-xs font-sans font-medium px-2.5 py-1 rounded-full flex items-center gap-1.5 z-10">
                    {room.highlight === "Bathtub" && <Bath size={11} />}
                    {room.highlight === "2 Double Beds" && <BedDouble size={11} />}
                    {room.highlight}
                  </span>
                )}
              </div>

              <div className="p-6 flex flex-col flex-1">
                <div className="flex items-start justify-between mb-2">
                  <h2 className="font-serif text-2xl text-earth-text">{room.name}</h2>
                  <div className="flex items-center gap-1 text-accent shrink-0">
                    <Star size={14} fill="currentColor" />
                    <span className="font-sans text-sm">{room.rating}</span>
                    <span className="text-earth-text/40 text-xs">({room.reviews})</span>
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
                  <span className="font-sans text-xs bg-accent/10 text-accent px-2.5 py-1 rounded-full">
                    Extra Bed Available
                  </span>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-primary/10">
                  <div className="flex items-center gap-4">
                    <div>
                      <span className="font-serif text-2xl text-primary">
                        ₹{room.price.toLocaleString("en-IN")}
                      </span>
                      <span className="font-sans text-xs text-earth-text/50 ml-1">{t("perNight")}</span>
                    </div>
                    <div className="flex items-center gap-1 text-earth-text/50 text-sm">
                      <Users size={14} />
                      <span>{t("maxGuests", { count: room.maxGuests })}</span>
                    </div>
                  </div>
                  <Link href={`${prefix}/rooms/${room.slug}`} className="btn-primary text-sm py-2 px-5">
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
