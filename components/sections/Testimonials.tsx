"use client";

import { useTranslations } from "next-intl";
import { Star, Quote, ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, useState } from "react";

/**
 * A testimonial as the home page hands it over.
 *
 * The three shown here used to be a literal in this file while 24 rows sat in
 * `testimonials` unread, and `isApproved` implied an approval workflow with no
 * panel to approve through and no page that would read an approved one (B-53).
 * Both ends exist now; this component only renders what it is given.
 *
 * Still a client component — the carousel is the whole point — so the page
 * fetches and passes down rather than this reaching for the database.
 */
export type TestimonialCard = {
  id: string;
  guestName: string;
  location: string | null;
  review: string;
  rating: number;
  stayDate: string | null;
};

/** How far a finger has to travel before it counts as a swipe, not a tap. */
const SWIPE_THRESHOLD_PX = 50;

export default function Testimonials({ testimonials }: { testimonials: TestimonialCard[] }) {
  const t = useTranslations("home");
  const [active, setActive] = useState(0);
  const touchStartX = useRef<number | null>(null);

  // Nothing approved yet is a real state — `isApproved` defaults to false, so a
  // fresh property has none. An empty quote card with a stray dot beneath it
  // reads as broken, so the section stands down entirely.
  if (testimonials.length === 0) return null;

  const total = testimonials.length;
  const index = Math.min(active, total - 1);
  const current = testimonials[index];

  const go = (to: number) => setActive((to + total) % total);

  return (
    <section className="py-20 bg-primary-50/30">
      <div className="container-resort">
        <div className="text-center mb-12">
          <h2 className="section-heading">{t("testimonialsTitle")}</h2>
        </div>

        {/* The quotes and the controls that move between them are one thing, so
            they are one group rather than a card and some loose buttons. */}
        <div className="max-w-3xl mx-auto" role="group" aria-label={t("testimonialsLabel")}>
          {/* Swipes on a phone, where this sits below the fold and the dots are
              the only other way through. `aria-live` because pressing a dot
              replaces the whole quote in place: without it the only feedback is
              text silently changing. */}
          <div
            className="relative bg-earth-white rounded-sm shadow-sm p-8 md:p-12"
            aria-live="polite"
            onTouchStart={(e) => {
              touchStartX.current = e.touches[0].clientX;
            }}
            onTouchEnd={(e) => {
              const from = touchStartX.current;
              touchStartX.current = null;
              if (from === null) return;
              const travelled = e.changedTouches[0].clientX - from;
              if (travelled <= -SWIPE_THRESHOLD_PX) go(index + 1);
              else if (travelled >= SWIPE_THRESHOLD_PX) go(index - 1);
            }}
          >
            <Quote size={40} className="text-primary-200 mb-6" aria-hidden="true" />
            <p className="font-serif text-lg md:text-xl text-earth-text leading-relaxed italic mb-6">
              &ldquo;{current.review}&rdquo;
            </p>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-sans font-semibold text-earth-text">{current.guestName}</p>
                <p className="font-sans text-sm text-earth-text/70">
                  {[current.location, current.stayDate].filter(Boolean).join(" · ")}
                </p>
              </div>
              {/* Five drawn stars announce as nothing at all, so the rating is
                  stated once in text and the stars are decoration. */}
              <div className="flex gap-0.5 shrink-0" role="img" aria-label={t("testimonialRating", { rating: current.rating })}>
                {Array.from({ length: current.rating }).map((_, i) => (
                  <Star key={i} size={16} className="text-accent" fill="currentColor" aria-hidden="true" />
                ))}
              </div>
            </div>
          </div>

          {/* Controls.

              The dots were 10px squares of colour — under the 24px WCAG floor,
              well under the 44px a thumb actually hits, and the only way through
              the set. The visual dot stays 10px because a 44px filled circle
              would be a different design; the *button* around it is 44px, which
              is what the finger and the pointer both get.

              Arrows either side because "next" is what most people want, and
              hunting for the right dot to press is not that. Rendered at all
              only when there is somewhere to go — controls that cannot move
              invite a press and then do nothing.

              The row wraps rather than overflowing: the home page asks for up
              to six quotes, and six 44px dots between two 44px arrows is wider
              than a 390px phone once the container padding is off it. The
              targets had to grow, so the row has to be able to give. */}
          {total > 1 && (
            <div className="flex flex-wrap items-center justify-center gap-y-1 mt-6">
              <button
                type="button"
                onClick={() => go(index - 1)}
                aria-label={t("testimonialPrevious")}
                className="w-11 h-11 rounded-full flex items-center justify-center text-primary hover:bg-primary-100 transition-colors"
              >
                <ChevronLeft size={20} aria-hidden="true" />
              </button>

              {testimonials.map((testimonial, i) => (
                <button
                  key={testimonial.id}
                  type="button"
                  onClick={() => setActive(i)}
                  aria-current={i === index ? "true" : undefined}
                  aria-label={t("testimonialGoTo", { index: i + 1, total })}
                  className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-primary-100 transition-colors"
                >
                  <span
                    aria-hidden="true"
                    className={`w-2.5 h-2.5 rounded-full transition-colors ${
                      i === index ? "bg-primary" : "bg-primary-200"
                    }`}
                  />
                </button>
              ))}

              <button
                type="button"
                onClick={() => go(index + 1)}
                aria-label={t("testimonialNext")}
                className="w-11 h-11 rounded-full flex items-center justify-center text-primary hover:bg-primary-100 transition-colors"
              >
                <ChevronRight size={20} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
