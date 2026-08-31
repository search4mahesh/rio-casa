"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Menu, X } from "lucide-react";
import { PROPERTY } from "@/lib/property";

export default function Navbar({ locale }: { locale: string }) {
  const t = useTranslations("nav");
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinks = [
    { href: "/",          label: t("home") },
    { href: "/about",     label: t("about") },
    { href: "/rooms",     label: t("rooms") },
    { href: "/gallery",   label: t("gallery") },
    { href: "/packages",  label: t("packages") },
    { href: "/dining",    label: t("dining") },
    { href: "/blog",      label: t("blog") },
    { href: "/contact",   label: t("contact") },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-earth-white/95 backdrop-blur-sm border-b border-primary-100 shadow-sm">
      <div className="container-resort flex items-center justify-between h-16">
        {/* Logo */}
        <Link href="/" className="flex flex-col leading-none">
          <span className="font-serif text-xl font-semibold text-primary">{PROPERTY.name}</span>
          <span className="font-sans text-xs text-accent tracking-widest uppercase">{PROPERTY.city}</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden lg:flex items-center gap-6">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="font-sans text-sm text-earth-text hover:text-primary transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Right side: Book Now */}
        <div className="hidden lg:flex items-center">
          <Link href="/booking" className="btn-primary text-sm py-2 px-4">
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
                href={link.href}
                className="font-sans text-sm text-earth-text py-2 border-b border-primary-50"
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <div className="pt-2">
              <Link
                href="/booking"
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
