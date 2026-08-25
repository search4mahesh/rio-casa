"use client";

import { useTranslations } from "next-intl";
import { Star, Quote } from "lucide-react";
import { useState } from "react";

const testimonials = [
  {
    name: "Priya Sharma",
    location: "Mumbai",
    review: "Rio Casa is an absolute gem. The rooms are stunning, the staff is warm, and waking up to the mist-covered hills every morning was pure magic.",
    rating: 5,
    date: "April 2025",
  },
  {
    name: "Arjun & Meera Patel",
    location: "Pune",
    review: "We celebrated our anniversary here and it was perfect. The honeymoon package was thoughtfully curated — the bonfire dinner was unforgettable!",
    rating: 5,
    date: "March 2025",
  },
  {
    name: "Rahul Deshmukh",
    location: "Nashik",
    review: "Best resort in Mahabaleshwar, hands down. The valley view from our suite was breathtaking. Will definitely return in monsoon!",
    rating: 5,
    date: "February 2025",
  },
];

export default function Testimonials() {
  const t = useTranslations("home");
  const [active, setActive] = useState(0);

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
              &ldquo;{testimonials[active].review}&rdquo;
            </p>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-sans font-semibold text-earth-text">{testimonials[active].name}</p>
                <p className="font-sans text-sm text-earth-text/50">{testimonials[active].location} · {testimonials[active].date}</p>
              </div>
              <div className="flex gap-0.5">
                {Array.from({ length: testimonials[active].rating }).map((_, i) => (
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
