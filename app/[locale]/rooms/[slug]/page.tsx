import Link from "next/link";
import { notFound } from "next/navigation";
import { useTranslations } from "next-intl";
import { Users, Star, ArrowLeft, Check } from "lucide-react";

const roomData: Record<string, {
  name: string;
  description: string;
  price: number;
  maxGuests: number;
  amenities: string[];
  rating: number;
  reviews: number;
  longDescription: string;
}> = {
  "deluxe-garden-view": {
    name: "Deluxe Garden View",
    description: "A beautifully appointed room overlooking our lush garden.",
    longDescription: "Wake up to the serene sight of our manicured gardens and the rolling hills of Mahabaleshwar beyond. The Deluxe Garden View room features a plush king-size bed, warm wooden furnishings, and a large window that frames nature like a painting. Perfect for couples seeking a romantic escape.",
    price: 4500,
    maxGuests: 2,
    amenities: ["King Bed", "Air Conditioning", "Hot Water", "Garden View", "Room Service", "Free Wi-Fi", "Daily Housekeeping", "Complimentary Breakfast"],
    rating: 4.8,
    reviews: 42,
  },
  "premium-valley-suite": {
    name: "Premium Valley Suite",
    description: "Spacious suite with panoramic valley views and a private balcony.",
    longDescription: "Indulge in the expansive Premium Valley Suite, where floor-to-ceiling windows and a private balcony offer unobstructed views of the Mahabaleshwar valley. The separate living area is ideal for families or couples who want space to relax in style.",
    price: 7500,
    maxGuests: 3,
    amenities: ["King Bed", "Air Conditioning", "Private Balcony", "Valley View", "Mini Bar", "Room Service", "Free Wi-Fi", "Complimentary Breakfast", "Evening Snacks"],
    rating: 4.9,
    reviews: 28,
  },
  "royal-hilltop-suite": {
    name: "Royal Hilltop Suite",
    description: "Our most luxurious suite with 360° hilltop views and butler service.",
    longDescription: "The pinnacle of luxury at Rio Casa — the Royal Hilltop Suite commands sweeping 360° views of the Sahyadri mountains. An in-suite jacuzzi, a dedicated butler, curated in-room dining, and a private terrace make this the ultimate Mahabaleshwar experience.",
    price: 12000,
    maxGuests: 4,
    amenities: ["King + Twin Beds", "Air Conditioning", "Private Jacuzzi", "360° View", "Butler Service", "Mini Bar", "Free Wi-Fi", "Complimentary Breakfast & Dinner", "Private Terrace"],
    rating: 5.0,
    reviews: 15,
  },
  "classic-double-room": {
    name: "Classic Double Room",
    description: "Cozy and comfortable double room for a peaceful getaway.",
    longDescription: "The Classic Double Room is the ideal choice for travellers who value comfort and value. Tastefully decorated with earthy tones, it offers everything you need for a restorative Mahabaleshwar stay — without compromise.",
    price: 3200,
    maxGuests: 2,
    amenities: ["Double Bed", "Air Conditioning", "Hot Water", "Room Service", "Free Wi-Fi", "Daily Housekeeping"],
    rating: 4.7,
    reviews: 67,
  },
};

export default function RoomDetailPage({
  params,
}: {
  params: { locale: string; slug: string };
}) {
  const room = roomData[params.slug];
  if (!room) notFound();

  const t = useTranslations("rooms");
  const prefix = params.locale !== "en" ? `/${params.locale}` : "";

  return (
    <div className="py-16 bg-earth-bg min-h-screen">
      <div className="container-resort">
        {/* Back link */}
        <Link
          href={`${prefix}/rooms`}
          className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary-600 mb-8 font-sans"
        >
          <ArrowLeft size={16} />
          Back to Rooms
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Images */}
          <div>
            <div className="h-80 bg-primary-100 rounded-sm flex items-center justify-center text-primary-400 mb-3">
              Main Room Image
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 bg-primary-50 rounded-sm flex items-center justify-center text-primary-300 text-xs">
                  Photo {i}
                </div>
              ))}
            </div>
          </div>

          {/* Details */}
          <div>
            <div className="flex items-start justify-between mb-3">
              <h1 className="font-serif text-3xl text-earth-text">{room.name}</h1>
              <div className="flex items-center gap-1 text-accent shrink-0">
                <Star size={16} fill="currentColor" />
                <span className="font-sans font-semibold">{room.rating}</span>
                <span className="text-earth-text/40 text-sm">({room.reviews} reviews)</span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-earth-text/60 text-sm mb-5">
              <Users size={15} />
              <span>{t("maxGuests", { count: room.maxGuests })}</span>
            </div>

            <p className="font-sans text-earth-text/70 leading-relaxed mb-6">
              {room.longDescription}
            </p>

            {/* Amenities */}
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
              <div className="flex items-baseline gap-2 mb-4">
                <span className="font-serif text-3xl text-primary">
                  ₹{room.price.toLocaleString("en-IN")}
                </span>
                <span className="font-sans text-sm text-earth-text/50">{t("perNight")}</span>
              </div>
              <Link
                href={`${prefix}/booking?room=${params.slug}`}
                className="btn-primary w-full text-center block"
              >
                {t("bookRoom")}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
