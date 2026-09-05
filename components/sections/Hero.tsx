"use client";

import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ArrowRight, ChevronDown } from "lucide-react";
import { PROPERTY } from "@/lib/property";
import StaySearchForm from "@/components/booking/StaySearchForm";

/**
 * The first screen, and now the first place a guest can ask the only question
 * they came with: is the property free on my dates?
 *
 * It used to offer two buttons — "Book Your Stay" and "Explore Rooms" — both of
 * which dropped the visitor somewhere that asked for the dates all over again.
 * The catalogue's date form is lifted here instead, as the same component, so
 * a visitor arriving from a search result answers the question once and lands
 * on `/rooms` with real per-room counts already resolved.
 *
 * The animation delays are short on purpose. They used to run to 1000ms on the
 * button row, which meant a phone visitor spent a full second looking at a
 * photograph with nothing on it to act on — and, because the content sits at
 * `opacity-0` until its animation runs, anything that stopped the animation
 * left the hero permanently blank. `globals.css` now also stands the whole set
 * down under `prefers-reduced-motion`.
 */
export default function Hero({ minCheckIn }: { minCheckIn: string }) {
  const t = useTranslations("hero");

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background */}
      <Image
        src="/images/hero/hero-night.jpg"
        alt={`${PROPERTY.billingName} at night`}
        fill
        priority
        className="object-cover object-center"
        sizes="100vw"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/45 to-black/75" />

      {/* Content */}
      <div className="relative z-10 text-center px-4 max-w-3xl mx-auto w-full py-24 animate-fade-in">
        <p className="font-sans text-sm tracking-[0.3em] uppercase text-accent-200 mb-4 opacity-0 animate-slide-up [animation-delay:80ms] [animation-fill-mode:forwards]">
          {PROPERTY.city}, {PROPERTY.region}
        </p>

        <h1 className="font-serif text-5xl md:text-7xl text-earth-white leading-tight mb-4 opacity-0 animate-slide-up [animation-delay:160ms] [animation-fill-mode:forwards]">
          {PROPERTY.name}
        </h1>

        <p className="font-serif text-xl md:text-2xl italic text-earth-white/90 mb-2 opacity-0 animate-slide-up [animation-delay:240ms] [animation-fill-mode:forwards]">
          {t("tagline")}
        </p>

        <p className="font-sans text-sm text-earth-white/70 mb-8 opacity-0 animate-slide-up [animation-delay:320ms] [animation-fill-mode:forwards]">
          {t("subTagline", { city: PROPERTY.city })}
        </p>

        {/* The one action worth putting first. `/rooms` answers it with a count
            per room type and, for anything booked out, the next date that
            works — none of which the two buttons this replaced could reach. */}
        <div className="opacity-0 animate-slide-up [animation-delay:400ms] [animation-fill-mode:forwards]">
          <StaySearchForm
            action="/rooms"
            minCheckIn={minCheckIn}
            heading={t("searchHeading")}
            className="bg-earth-white rounded-sm shadow-xl p-5 text-left"
          />

          <Link
            href="/rooms"
            className="inline-flex items-center gap-1.5 mt-5 font-sans text-sm text-earth-white/80 underline underline-offset-4 hover:text-earth-white transition-colors"
          >
            {t("browseRooms")}
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>

      {/* Scroll indicator. Decorative — the sections below are reachable by
          scrolling, by the nav and by the link above, so it is hidden from
          assistive technology rather than announced as a stray graphic. */}
      <div
        aria-hidden="true"
        className="absolute bottom-6 left-1/2 -translate-x-1/2 text-earth-white/50 animate-bounce"
      >
        <ChevronDown size={26} />
      </div>
    </section>
  );
}
