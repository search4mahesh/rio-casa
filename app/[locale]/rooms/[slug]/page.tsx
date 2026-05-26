import Link from "next/link";
import { notFound } from "next/navigation";
import { useTranslations } from "next-intl";
import { Users, Star, ArrowLeft, Check, Bath, BedDouble, Wifi, Tv, Wind, Droplets, UtensilsCrossed } from "lucide-react";

const roomData: Record<string, {
  name: string;
  description: string;
  longDescription: string;
  price: number;
  maxGuests: number;
  extraBed: boolean;
  amenities: string[];
  highlights: { icon: string; label: string }[];
  rating: number;
  reviews: number;
  count: number;
}> = {
  "deluxe-room": {
    name: "Deluxe Room",
    description: "Comfort and calm in the hills of Mahabaleshwar.",
    longDescription: "A beautifully appointed Deluxe Room designed for couples or solo travellers. Warm earthy décor, a comfortable double bed, and all the essentials for a restorative hill station stay. Six rooms are available across both floors, with Room 104 offering a lovely forest view.",
    price: 4500,
    maxGuests: 2,
    extraBed: true,
    amenities: ["AC", "WiFi", "LED TV", "Hot Water", "Room Service", "Daily Housekeeping", "Extra Bed on Request", "Complimentary Breakfast"],
    highlights: [
      { icon: "wind",   label: "Air Conditioning" },
      { icon: "wifi",   label: "Free WiFi" },
      { icon: "tv",     label: "LED TV" },
      { icon: "water",  label: "24hr Hot Water" },
    ],
    rating: 4.8,
    reviews: 94,
    count: 6,
  },
  "premium-room": {
    name: "Premium Room",
    description: "Luxury with a soaking bathtub on the upper floor.",
    longDescription: "The Premium Room takes your stay up a notch with a private soaking bathtub — perfect for unwinding after a day of sightseeing around Mahabaleshwar. Located on the second floor, these two rooms feature premium toiletries, extra-comfortable bedding, and thoughtful touches that make the difference.",
    price: 6500,
    maxGuests: 2,
    extraBed: true,
    amenities: ["AC", "WiFi", "LED TV", "Hot Water", "Soaking Bathtub", "Premium Toiletries", "Room Service", "Daily Housekeeping", "Extra Bed on Request", "Complimentary Breakfast"],
    highlights: [
      { icon: "bath",   label: "Soaking Bathtub" },
      { icon: "wind",   label: "Air Conditioning" },
      { icon: "wifi",   label: "Free WiFi" },
      { icon: "water",  label: "Premium Toiletries" },
    ],
    rating: 4.9,
    reviews: 36,
    count: 2,
  },
  "family-room": {
    name: "Family Room",
    description: "Spacious comfort for the whole family.",
    longDescription: "Our largest room, designed specifically for families. The Family Room features two double beds, a comfortable seating area, and all the space you need for a relaxed Mahabaleshwar holiday. Accommodates up to 4 guests with an additional extra bed available on request — perfect for a family of 5.",
    price: 7500,
    maxGuests: 4,
    extraBed: true,
    amenities: ["AC", "WiFi", "LED TV", "Hot Water", "2 Double Beds", "Seating Area", "Room Service", "Daily Housekeeping", "Extra Bed on Request", "Complimentary Breakfast"],
    highlights: [
      { icon: "bed",    label: "2 Double Beds" },
      { icon: "sofa",   label: "Seating Area" },
      { icon: "wind",   label: "Air Conditioning" },
      { icon: "wifi",   label: "Free WiFi" },
    ],
    rating: 4.9,
    reviews: 28,
    count: 1,
  },
};

export default function RoomDetailPage({ params }: { params: { locale: string; slug: string } }) {
  const room = roomData[params.slug];
  if (!room) notFound();

  const t = useTranslations("rooms");
  const prefix = params.locale !== "en" ? `/${params.locale}` : "";

  return (
    <div className="py-16 bg-earth-bg min-h-screen">
      <div className="container-resort">
        {/* Back link */}
        <Link href={`${prefix}/rooms`} className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80 mb-8 font-sans">
          <ArrowLeft size={16} />
          Back to Rooms
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Images */}
          <div>
            <div className="h-80 bg-primary/10 rounded-sm flex items-center justify-center text-primary/40 mb-3">
              Main Room Image
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 bg-primary/5 rounded-sm flex items-center justify-center text-primary/30 text-xs">
                  Photo {i}
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
                <span className="font-sans font-semibold">{room.rating}</span>
                <span className="text-earth-text/40 text-sm">({room.reviews} reviews)</span>
              </div>
            </div>

            <p className="font-sans text-sm text-earth-text/50 italic mb-4">{room.description}</p>

            <div className="flex items-center gap-4 text-earth-text/60 text-sm mb-6">
              <div className="flex items-center gap-1.5">
                <Users size={15} />
                <span>Up to {room.maxGuests} guests</span>
              </div>
              {room.extraBed && (
                <div className="flex items-center gap-1.5 text-accent">
                  <BedDouble size={15} />
                  <span>Extra bed available</span>
                </div>
              )}
            </div>

            <p className="font-sans text-earth-text/70 leading-relaxed mb-6">{room.longDescription}</p>

            {/* Quick highlights */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              {room.highlights.map((h) => (
                <div key={h.label} className="flex items-center gap-2.5 bg-earth-white rounded-sm px-3 py-2.5">
                  {h.icon === "bath"  && <Bath   size={16} className="text-primary shrink-0" />}
                  {h.icon === "wind"  && <Wind   size={16} className="text-primary shrink-0" />}
                  {h.icon === "wifi"  && <Wifi   size={16} className="text-primary shrink-0" />}
                  {h.icon === "tv"    && <Tv     size={16} className="text-primary shrink-0" />}
                  {h.icon === "water" && <Droplets size={16} className="text-primary shrink-0" />}
                  {h.icon === "bed"   && <BedDouble size={16} className="text-primary shrink-0" />}
                  {h.icon === "sofa"  && <UtensilsCrossed size={16} className="text-primary shrink-0" />}
                  <span className="font-sans text-sm text-earth-text/80">{h.label}</span>
                </div>
              ))}
            </div>

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
                  <span className="font-serif text-3xl text-primary">₹{room.price.toLocaleString("en-IN")}</span>
                  <span className="font-sans text-sm text-earth-text/50 ml-2">{t("perNight")}</span>
                </div>
                <span className="font-sans text-xs text-earth-text/40">+taxes</span>
              </div>
              <p className="font-sans text-xs text-earth-text/50 mb-4">Extra bed charges apply on request</p>
              <Link href={`${prefix}/booking?room=${params.slug}`} className="btn-primary w-full text-center block">
                {t("bookRoom")}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
