"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { PROPERTY } from "@/lib/property";

/**
 * The filters this page offers, in the order it offers them.
 *
 * Each one needs a matching key under `gallery.categories` in
 * `messages/en.json` — next-intl does not fall back, so a category added
 * here and not there renders the raw key path to the visitor. The labels used
 * to be a second literal map in this file, which is the only reason a
 * `gallery.categories` namespace could sit in the string store unread.
 *
 * `all` aside, these are `gallery_images.category` values. A filter for a
 * category no row carries is a control that always answers "0 photos".
 */
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

/** How far a finger has to travel before it counts as a swipe, not a tap. */
const SWIPE_THRESHOLD_PX = 50;

export default function GalleryGrid({ images }: { images: GalleryItem[] }) {
  const t = useTranslations("gallery");
  const [activeCategory, setActiveCategory] = useState<Category>("all");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  // The tile that opened the viewer, so closing puts focus back where the guest
  // left it rather than at the top of the document.
  const openerRef = useRef<HTMLElement | null>(null);
  const touchStartX = useRef<number | null>(null);

  const filtered = activeCategory === "all" ? images : images.filter((img) => img.category === activeCategory);
  const open = lightboxIndex !== null;

  function openLightbox(id: string) {
    const idx = filtered.findIndex((img) => img.id === id);
    if (idx === -1) return;
    openerRef.current = document.activeElement as HTMLElement | null;
    setLightboxIndex(idx);
  }

  const close = useCallback(() => {
    setLightboxIndex(null);
    openerRef.current?.focus();
  }, []);

  const prev = useCallback(() => {
    setLightboxIndex((i) => (i === null ? null : (i - 1 + filtered.length) % filtered.length));
  }, [filtered.length]);

  const next = useCallback(() => {
    setLightboxIndex((i) => (i === null ? null : (i + 1) % filtered.length));
  }, [filtered.length]);

  /**
   * The viewer's keyboard, which it did not have one of.
   *
   * Escape, and the arrows the chevrons stand for. Without these the only way
   * out of a full-screen overlay was a mouse click on a 28px icon — and a
   * keyboard user, who could not open it at all, would have had no way back.
   */
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
        return;
      }
      if (e.key !== "Tab") return;

      // Focus stays inside the dialog. Otherwise Tab walks off into the grid
      // underneath, which is still in the document and now hidden behind a
      // full-screen overlay — so focus goes somewhere the guest can neither see
      // nor get back from.
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>("button");
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close, prev, next]);

  // The page behind the overlay used to scroll with it.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Focus lands on Close: what a guest who opened this by accident wants, and
  // the anchor the Tab cycle above starts from.
  useEffect(() => {
    if (!open) return;
    dialogRef.current?.querySelector<HTMLElement>("button")?.focus();
  }, [open]);

  // Changing the filter can leave the open index past the end of the new list.
  useEffect(() => {
    setLightboxIndex((i) => (i !== null && i >= filtered.length ? null : i));
  }, [filtered.length]);

  // Index and image together, so the caption's position can be rendered without
  // TypeScript having to re-derive that one implies the other. The bounds check
  // also covers the render between a filter press and the effect above closing
  // an index the new list no longer has.
  const viewing =
    lightboxIndex !== null && filtered[lightboxIndex]
      ? { index: lightboxIndex, image: filtered[lightboxIndex] }
      : null;

  return (
    <div className="min-h-screen bg-earth-bg py-16">
      <div className="container-resort">
        {/* Header */}
        <div className="text-center mb-10">
          <p className="section-subheading mb-2">{t("subtitle", { property: PROPERTY.name })}</p>
          <h1 className="section-heading">{t("title")}</h1>
          {/* Announced, because it is the only feedback a filter press gives to
              someone who cannot watch the grid rearrange. */}
          <p className="font-sans text-sm text-earth-text/70 mt-2" aria-live="polite">
            {t("photoCount", { count: filtered.length })}
          </p>
        </div>

        {/* Category filter. A row of toggles is a group, not a set of unrelated
            buttons — see CLAUDE.md on `role="group"`. `aria-pressed` is what says
            which one is on; the fill alone was mouse-and-eyes only. */}
        <div role="group" aria-label={t("filterLabel")} className="flex flex-wrap justify-center gap-2 mb-10">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              aria-pressed={activeCategory === cat}
              onClick={() => setActiveCategory(cat)}
              className={`font-sans text-sm px-4 py-2 rounded-full border transition-colors ${
                activeCategory === cat
                  ? "bg-primary text-white border-primary"
                  : "border-primary/30 text-earth-text hover:border-primary"
              }`}
            >
              {t(`categories.${cat}`)}
            </button>
          ))}
        </div>

        {/* Masonry grid. Each tile is a `<button>`, not a `<div onClick>`: the old
            markup could not be reached by Tab, opened for no key, and was
            announced as a photograph with no hint that it did anything. */}
        <div className="columns-2 md:columns-3 lg:columns-4 gap-3 space-y-3">
          {filtered.map((img, idx) => (
            <button
              key={img.id}
              type="button"
              onClick={() => openLightbox(img.id)}
              aria-label={t("viewPhoto", { alt: img.alt })}
              className="relative break-inside-avoid overflow-hidden rounded-sm cursor-pointer group block w-full"
              style={{ height: idx % 5 === 0 ? "260px" : idx % 3 === 0 ? "200px" : "170px" }}
            >
              <Image
                src={img.src}
                alt={img.alt}
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-500"
                sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
              />
              {/* Revealed on keyboard focus as well as hover, or the caption is
                  mouse-only. */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 group-focus:bg-black/30 transition-colors duration-300 flex items-end">
                <p className="text-white text-xs font-sans px-3 py-2 text-left translate-y-full group-hover:translate-y-0 group-focus:translate-y-0 transition-transform duration-300 leading-snug">
                  {img.alt}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Lightbox. The backdrop *is* the dialog, rather than wrapping one in a
          `display: contents` element: that laid out correctly, but
          `display: contents` is known to drop an element's ARIA role in some
          engines — and the role it would drop here is the one that makes this
          announce as a modal at all. */}
      {viewing && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={t("lightboxLabel")}
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={close}
        >
          {/* Close */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); close(); }}
            className="absolute top-4 right-4 text-white/80 hover:text-white p-2"
            aria-label={t("close")}
          >
            <X size={28} aria-hidden="true" />
          </button>

          {/* Prev */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); prev(); }}
            className="absolute left-4 text-white/80 hover:text-white p-2"
            aria-label={t("previous")}
          >
            <ChevronLeft size={36} aria-hidden="true" />
          </button>

          {/* The photograph. Swipes on a phone, where the chevrons sit under the
              thumbs holding it and most of this page is viewed. */}
          <div
            className="relative max-w-4xl max-h-[85vh] w-full mx-16"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
            onTouchEnd={(e) => {
              const from = touchStartX.current;
              touchStartX.current = null;
              if (from === null) return;
              const travelled = e.changedTouches[0].clientX - from;
              if (travelled <= -SWIPE_THRESHOLD_PX) next();
              else if (travelled >= SWIPE_THRESHOLD_PX) prev();
            }}
          >
            <div className="relative" style={{ aspectRatio: "4/3" }}>
              <Image
                src={viewing.image.src}
                alt={viewing.image.alt}
                fill
                className="object-contain"
                sizes="90vw"
                priority
              />
            </div>
            {/* Announced on every move, so which photograph this is and where it
                sits in the set are not eyes-only information. */}
            <p className="text-center text-white/70 font-sans text-sm mt-3" aria-live="polite">
              {viewing.image.alt}
              <span className="text-white/40 ml-3">
                {t("photoPosition", { index: viewing.index + 1, total: filtered.length })}
              </span>
            </p>
          </div>

          {/* Next */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); next(); }}
            className="absolute right-4 text-white/80 hover:text-white p-2"
            aria-label={t("next")}
          >
            <ChevronRight size={36} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
