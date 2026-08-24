"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

const categories = ["all", "rooms", "amenities", "nature"] as const;

// Captions must match lib/room-marketing.ts, the canonical file → room-type
// mapping every other page uses. The `deluxe-*`/`premium-*` filenames are
// legacy — from before the room catalogue was corrected — and no longer
// match what they actually show: `deluxe-main.jpg`/`deluxe-wardrobe.jpg` are
// the Standard Room's photos there, and `premium-bed.jpg`/`premium-bathtub.jpg`
// are the Luxury Room's ("Premium Room" isn't a room type this property has).
// Captioning by filename instead of by the real mapping is how this page
// drifted out of sync with /rooms and the booking wizard (see B-24, B-31).
const images = [
  // ── Rooms ──────────────────────────────────────────────────────────────
  { id:  1, src: "/images/rooms/deluxe-main.jpg",        category: "rooms",     alt: "Standard Room — double bed with wood ceiling" },
  { id:  2, src: "/images/rooms/premium-bed.jpg",        category: "rooms",     alt: "Luxury Room — upholstered headboard" },
  { id:  3, src: "/images/rooms/premium-bathtub.jpg",    category: "rooms",     alt: "Luxury Room — soaking bathtub" },
  { id:  4, src: "/images/rooms/family-main.jpg",        category: "rooms",     alt: "Family Room — two double beds" },
  { id:  5, src: "/images/rooms/family-beds.jpg",        category: "rooms",     alt: "Family Room — side-by-side beds" },
  { id:  6, src: "/images/rooms/deluxe-wardrobe.jpg",    category: "rooms",     alt: "Standard Room — wardrobe and TV unit" },
  { id:  7, src: "/images/rooms/bathroom-vessel.jpg",    category: "rooms",     alt: "Ensuite bathroom — vessel sink and round mirror" },
  { id:  8, src: "/images/rooms/bathroom-grey.jpg",      category: "rooms",     alt: "Ensuite bathroom — grey marble" },
  { id:  9, src: "/images/rooms/bathroom-dark.jpg",      category: "rooms",     alt: "Ensuite bathroom — dark marble tiles" },
  { id: 10, src: "/images/rooms/room-entrance.jpg",      category: "rooms",     alt: "Room entrance" },
  // ── Amenities ──────────────────────────────────────────────────────────
  { id: 11, src: "/images/rooms/balcony-chairs.jpg",     category: "amenities", alt: "Private balcony — rattan chairs and table" },
  { id: 12, src: "/images/rooms/balcony-courtyard.jpg",  category: "amenities", alt: "Balcony — courtyard view" },
  { id: 13, src: "/images/rooms/balcony-wide.jpg",       category: "amenities", alt: "Balcony — wide open view" },
  { id: 14, src: "/images/rooms/tea-coffee.jpg",         category: "amenities", alt: "In-room tea & coffee station" },
  { id: 15, src: "/images/gallery/amenities/staircase-wood.jpg",    category: "amenities", alt: "Staircase — polished wood floor" },
  { id: 16, src: "/images/gallery/amenities/staircase-granite.jpg", category: "amenities", alt: "Staircase — granite steps and steel railing" },
  { id: 17, src: "/images/gallery/rooms/corridor-upper.jpg",        category: "amenities", alt: "Upper-floor corridor" },
  { id: 18, src: "/images/gallery/rooms/corridor-lower.jpg",        category: "amenities", alt: "Ground-floor corridor" },
  // ── Nature / Exterior ──────────────────────────────────────────────────
  { id: 19, src: "/images/rooms/view-forest.jpg",        category: "nature",    alt: "Forest view from room window" },
  { id: 20, src: "/images/hero/exterior-front.jpg",      category: "nature",    alt: "Rio Casa — front view" },
  { id: 21, src: "/images/hero/exterior-wide.jpg",       category: "nature",    alt: "Rio Casa — wide angle" },
  { id: 22, src: "/images/hero/exterior-courtyard.jpg",  category: "nature",    alt: "Resort courtyard" },
  { id: 23, src: "/images/hero/hero-night.jpg",          category: "nature",    alt: "Rio Casa at night" },
];

type Category = (typeof categories)[number];

export default function GalleryPage() {
  const t = useTranslations("gallery");
  const [activeCategory, setActiveCategory] = useState<Category>("all");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const filtered = activeCategory === "all" ? images : images.filter((img) => img.category === activeCategory);

  function openLightbox(id: number) {
    const idx = filtered.findIndex((img) => img.id === id);
    if (idx !== -1) setLightboxIndex(idx);
  }

  function prev() {
    setLightboxIndex((i) => (i === null ? null : (i - 1 + filtered.length) % filtered.length));
  }

  function next() {
    setLightboxIndex((i) => (i === null ? null : (i + 1) % filtered.length));
  }

  const catLabels: Record<Category, string> = {
    all: "All Photos",
    rooms: "Rooms",
    amenities: "Amenities",
    nature: "Exterior & Views",
  };

  return (
    <div className="min-h-screen bg-earth-bg py-16">
      <div className="container-resort">
        {/* Header */}
        <div className="text-center mb-10">
          <p className="section-subheading mb-2">{t("subtitle")}</p>
          <h1 className="section-heading">{t("title")}</h1>
          <p className="font-sans text-sm text-earth-text/50 mt-2">{filtered.length} photos</p>
        </div>

        {/* Category filter */}
        <div className="flex flex-wrap justify-center gap-2 mb-10">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`font-sans text-sm px-4 py-2 rounded-full border transition-colors ${
                activeCategory === cat
                  ? "bg-primary text-white border-primary"
                  : "border-primary/30 text-earth-text hover:border-primary"
              }`}
            >
              {catLabels[cat]}
            </button>
          ))}
        </div>

        {/* Masonry grid */}
        <div className="columns-2 md:columns-3 lg:columns-4 gap-3 space-y-3">
          {filtered.map((img, idx) => (
            <div
              key={img.id}
              onClick={() => openLightbox(img.id)}
              className="relative break-inside-avoid overflow-hidden rounded-sm cursor-pointer group"
              style={{ height: idx % 5 === 0 ? "260px" : idx % 3 === 0 ? "200px" : "170px" }}
            >
              <Image
                src={img.src}
                alt={img.alt}
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-500"
                sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
              />
              {/* Hover overlay */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-300 flex items-end">
                <p className="text-white text-xs font-sans px-3 py-2 translate-y-full group-hover:translate-y-0 transition-transform duration-300 leading-snug">
                  {img.alt}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={() => setLightboxIndex(null)}
        >
          {/* Close */}
          <button
            onClick={() => setLightboxIndex(null)}
            className="absolute top-4 right-4 text-white/80 hover:text-white p-2"
            aria-label="Close"
          >
            <X size={28} />
          </button>

          {/* Prev */}
          <button
            onClick={(e) => { e.stopPropagation(); prev(); }}
            className="absolute left-4 text-white/80 hover:text-white p-2"
            aria-label="Previous"
          >
            <ChevronLeft size={36} />
          </button>

          {/* Image */}
          <div
            className="relative max-w-4xl max-h-[85vh] w-full mx-16"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative" style={{ aspectRatio: "4/3" }}>
              <Image
                src={filtered[lightboxIndex].src}
                alt={filtered[lightboxIndex].alt}
                fill
                className="object-contain"
                sizes="90vw"
                priority
              />
            </div>
            <p className="text-center text-white/70 font-sans text-sm mt-3">
              {filtered[lightboxIndex].alt}
              <span className="text-white/40 ml-3">{lightboxIndex + 1} / {filtered.length}</span>
            </p>
          </div>

          {/* Next */}
          <button
            onClick={(e) => { e.stopPropagation(); next(); }}
            className="absolute right-4 text-white/80 hover:text-white p-2"
            aria-label="Next"
          >
            <ChevronRight size={36} />
          </button>
        </div>
      )}
    </div>
  );
}
