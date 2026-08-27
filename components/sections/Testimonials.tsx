"use client";

import { useTranslations } from "next-intl";
import { Star, Quote } from "lucide-react";
import { useState } from "react";

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

export default function Testimonials({ testimonials }: { testimonials: TestimonialCard[] }) {
  const t = useTranslations("home");
  const [active, setActive] = useState(0);

  // Nothing approved yet is a real state — `isApproved` defaults to false, so a
  // fresh property has none. An empty quote card with a stray dot beneath it
  // reads as broken, so the section stands down entirely.
  if (testimonials.length === 0) return null;

  const current = testimonials[Math.min(active, testimonials.length - 1)];

  return (
    <section className="py-20 bg-primary-50/30">
      <div className="container-resort">
        <div className="text-center mb-12">
          <h2 className="section-heading">{t("testimonialsTitle")}</h2>
        </div>

        <div className="max-w-3xl mx-auto">
          <div className="relative bg-earth-white rounded-sm shadow-sm p-8 md:p-12">
            <Quote size={40} className="text-primary-200 mb-6" />
            <p className="font-serif text-lg md:text-xl text-earth-text leading-relaxed italic mb-6">
              &ldquo;{current.review}&rdquo;
            </p>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-sans font-semibold text-earth-text">{current.guestName}</p>
                <p className="font-sans text-sm text-earth-text/70">
                  {[current.location, current.stayDate].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="flex gap-0.5">
                {Array.from({ length: current.rating }).map((_, i) => (
                  <Star key={i} size={16} className="text-accent" fill="currentColor" />
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-center gap-2 mt-6">
            {testimonials.map((_, i) => (
              <button
                key={i}
                onClick={() => setActive(i)}
                className={`w-2.5 h-2.5 rounded-full transition-colors ${
                  i === active ? "bg-primary" : "bg-primary-200"
                }`}
                aria-label={`Testimonial ${i + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
