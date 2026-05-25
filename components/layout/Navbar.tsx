"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Menu, X } from "lucide-react";

const localeLabels: Record<string, string> = {
  en: "EN",
  hi: "हिं",
  mr: "मर",
};

const locales = ["en", "hi", "mr"] as const;

export default function Navbar({ locale }: { locale: string }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinks = [
    { href: "/", label: t("home") },
    { href: "/about", label: t("about") },
    { href: "/rooms", label: t("rooms") },
    { href: "/gallery", label: t("gallery") },
    { href: "/packages", label: t("packages") },
    { href: "/dining", label: t("dining") },
    { href: "/blog", label: t("blog") },
  ];

  // With localePrefix:"always", URLs are always /{locale}/path
  function switchLocale(newLocale: string) {
    const segments = pathname.split("/").filter(Boolean);
    const isLocaleSegment = locales.includes(segments[0] as (typeof locales)[number]);
    const rest = isLocaleSegment ? segments.slice(1) : segments;
    const newPath = `/${newLocale}${rest.length ? "/" + rest.join("/") : ""}`;
    router.push(newPath);
  }

  function localHref(path: string) {
    return `/${locale}${path === "/" ? "" : path}`;
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-earth-white/95 backdrop-blur-sm border-b border-primary-100 shadow-sm">
      <div className="container-resort flex items-center justify-between h-16">
        {/* Logo */}
        <Link href={`/${locale}`} className="flex flex-col leading-none">
          <span className="font-serif text-xl font-semibold text-primary">Rio Casa</span>
          <span className="font-sans text-xs text-accent tracking-widest uppercase">Mahabaleshwar</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden lg:flex items-center gap-6">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={localHref(link.href)}
              className="font-sans text-sm text-earth-text hover:text-primary transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Right side: locale toggle + Book Now */}
        <div className="hidden lg:flex items-center gap-3">
          <div className="flex rounded-sm border border-primary-200 overflow-hidden">
            {locales.map((loc) => (
              <button
                key={loc}
                onClick={() => switchLocale(loc)}
                className={`px-2 py-1 text-xs font-sans transition-colors ${
                  locale === loc
                    ? "bg-primary text-earth-white"
                    : "text-earth-text hover:bg-primary-50"
                }`}
              >
                {localeLabels[loc]}
              </button>
            ))}
          </div>
          <Link href={localHref("/booking")} className="btn-primary text-sm py-2 px-4">
            {t("bookNow")}
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          className="lg:hidden p-2 text-earth-text"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="lg:hidden bg-earth-white border-t border-primary-100 py-4">
          <div className="container-resort flex flex-col gap-3">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={localHref(link.href)}
                className="font-sans text-sm text-earth-text py-2 border-b border-primary-50"
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <div className="flex items-center gap-3 pt-2">
              <div className="flex rounded-sm border border-primary-200 overflow-hidden">
                {locales.map((loc) => (
                  <button
                    key={loc}
                    onClick={() => { switchLocale(loc); setMobileOpen(false); }}
                    className={`px-3 py-1.5 text-xs font-sans transition-colors ${
                      locale === loc
                        ? "bg-primary text-earth-white"
                        : "text-earth-text hover:bg-primary-50"
                    }`}
                  >
                    {localeLabels[loc]}
                  </button>
                ))}
              </div>
              <Link
                href={localHref("/booking")}
                className="btn-primary text-sm py-2 px-4"
                onClick={() => setMobileOpen(false)}
              >
                {t("bookNow")}
              </Link>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
