"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";

export default function Hero({ locale }: { locale: string }) {
  const t = useTranslations("hero");
  const prefix = `/${locale}`;

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/images/hero-bg.jpg')" }}
      />
      {/* Fallback gradient when no image */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary-800/80 to-primary-900/90" />
      <div className="absolute inset-0 bg-hero-gradient" />

      {/* Content */}
      <div className="relative z-10 text-center px-4 max-w-4xl mx-auto animate-fade-in">
        <p className="font-sans text-sm tracking-[0.3em] uppercase text-accent mb-4 opacity-0 animate-slide-up [animation-delay:200ms] [animation-fill-mode:forwards]">
          Mahabaleshwar, Maharashtra
        </p>

        <h1 className="font-serif text-5xl md:text-7xl text-earth-white leading-tight mb-4 opacity-0 animate-slide-up [animation-delay:400ms] [animation-fill-mode:forwards]">
          Rio Casa
        </h1>

        <p className="font-serif text-xl md:text-2xl italic text-earth-white/90 mb-3 opacity-0 animate-slide-up [animation-delay:600ms] [animation-fill-mode:forwards]">
          {t("tagline")}
        </p>

        <p className="font-sans text-sm text-earth-white/70 mb-10 opacity-0 animate-slide-up [animation-delay:800ms] [animation-fill-mode:forwards]">
          {t("subTagline")}
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
