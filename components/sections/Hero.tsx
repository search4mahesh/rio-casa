"use client";

import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { PROPERTY } from "@/lib/property";

export default function Hero({ locale }: { locale: string }) {
  const t = useTranslations("hero");
  const prefix = "";

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
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/40 to-black/70" />

      {/* Content */}
      <div className="relative z-10 text-center px-4 max-w-4xl mx-auto animate-fade-in">
        <p className="font-sans text-sm tracking-[0.3em] uppercase text-accent mb-4 opacity-0 animate-slide-up [animation-delay:200ms] [animation-fill-mode:forwards]">
          {PROPERTY.city}, {PROPERTY.region}
        </p>

        <h1 className="font-serif text-5xl md:text-7xl text-earth-white leading-tight mb-4 opacity-0 animate-slide-up [animation-delay:400ms] [animation-fill-mode:forwards]">
          {PROPERTY.name}
        </h1>

        <p className="font-serif text-xl md:text-2xl italic text-earth-white/90 mb-3 opacity-0 animate-slide-up [animation-delay:600ms] [animation-fill-mode:forwards]">
          {t("tagline")}
        </p>

        <p className="font-sans text-sm text-earth-white/70 mb-10 opacity-0 animate-slide-up [animation-delay:800ms] [animation-fill-mode:forwards]">
          {t("subTagline", { city: PROPERTY.city })}
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center opacity-0 animate-slide-up [animation-delay:1000ms] [animation-fill-mode:forwards]">
          <Link href={`${prefix}/booking`} className="btn-primary text-base px-8 py-3.5">
            {t("cta")}
          </Link>
          <Link
            href={`${prefix}/rooms`}
            className="border border-white text-white px-8 py-3.5 rounded-sm font-sans font-medium tracking-wide hover:bg-white hover:text-earth-text transition-colors duration-200 text-base"
          >
            {t("exploreRooms")}
          </Link>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-earth-white/60 animate-bounce">
        <ChevronDown size={28} />
      </div>
    </section>
  );
}
