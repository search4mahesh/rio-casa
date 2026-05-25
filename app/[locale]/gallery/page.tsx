"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

const categories = ["all", "rooms", "dining", "amenities", "nature", "events"] as const;

const images = [
  { id: 1, category: "rooms", alt: "Deluxe Garden View Room" },
  { id: 2, category: "rooms", alt: "Premium Valley Suite" },
  { id: 3, category: "rooms", alt: "Royal Hilltop Suite" },
  { id: 4, category: "dining", alt: "Restaurant interior" },
  { id: 5, category: "dining", alt: "Maharashtrian cuisine" },
  { id: 6, category: "amenities", alt: "Swimming pool" },
  { id: 7, category: "amenities", alt: "Bonfire area" },
  { id: 8, category: "nature", alt: "Mahabaleshwar valley view" },
  { id: 9, category: "nature", alt: "Misty morning hills" },
  { id: 10, category: "events", alt: "Wedding setup" },
  { id: 11, category: "nature", alt: "Strawberry fields" },
  { id: 12, category: "amenities", alt: "Resort garden" },
];

export default function GalleryPage() {
  const t = useTranslations("gallery");
  const [activeCategory, setActiveCategory] = useState<(typeof categories)[number]>("all");

  const filtered = activeCategory === "all" ? images : images.filter((img) => img.category === activeCategory);

  return (
    <div className="min-h-screen bg-earth-bg py-16">
      <div className="container-resort">
        <div className="text-center mb-10">
          <p className="section-subheading mb-2">{t("subtitle")}</p>
          <h1 className="section-heading">{t("title")}</h1>
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
                  : "border-primary-200 text-earth-text hover:border-primary"
              }`}
            >
              {t(`categories.${cat}`)}
            </button>
          ))}
        </div>

        {/* Masonry grid */}
        <div className="columns-2 md:columns-3 lg:columns-4 gap-3 space-y-3">
          {filtered.map((img) => (
            <div
              key={img.id}
              className="bg-primary-100 rounded-sm overflow-hidden break-inside-avoid cursor-pointer hover:opacity-90 transition-opacity"
              style={{ height: img.id % 3 === 0 ? "200px" : img.id % 2 === 0 ? "160px" : "240px" }}
            >
              <div className="w-full h-full flex items-center justify-center text-primary-400 text-xs text-center px-2">
                {img.alt}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
