"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { PROPERTY } from "@/lib/property";

const categories = ["all", "rooms", "amenities", "nature"] as const;

/**
 * A gallery image as the page hands it over.
 *
 * The 23 images used to be a literal in this file while `gallery_images` sat
 * empty and unread (B-53). They are rows now, seeded by
 * `prisma/seed-content.ts`, so adding a photograph is no longer a deploy.
 *
 * Captions still have to match `lib/room-marketing.ts`, the canonical file →
 * room-type mapping every other page uses. The `deluxe-*`/`premium-*`
 * filenames are legacy — from before the room catalogue was corrected — and no
 * longer match what they show: `deluxe-main.jpg` is the Standard Room's photo
 * there, and `premium-bed.jpg` the Luxury Room's ("Premium Room" is not a room
 * type this property has). Captioning by filename rather than by the real
 * mapping is how this page drifted out of sync with /rooms and the booking
 * wizard (B-24, B-31). That correctness now lives in the seeded alt text.
 */
export type GalleryItem = {
  id: string;
  src: string;
  category: string;
  alt: string;
};

type Category = (typeof categories)[number];

export default function GalleryGrid({ images }: { images: GalleryItem[] }) {
  const t = useTranslations("gallery");
  const [activeCategory, setActiveCategory] = useState<Category>("all");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const filtered = activeCategory === "all" ? images : images.filter((img) => img.category === activeCategory);

  function openLightbox(id: string) {
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
          <p className="section-subheading mb-2">{t("subtitle", { property: PROPERTY.name })}</p>
          <h1 className="section-heading">{t("title")}</h1>
          <p className="font-sans text-sm text-earth-text/70 mt-2">{filtered.length} photos</p>
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
