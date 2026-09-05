"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Menu, X } from "lucide-react";
import { PROPERTY } from "@/lib/property";

/**
 * Strip the locale segment, so `/en/rooms` and `/rooms` compare the same.
 *
 * `middleware.ts` registers one locale and next-intl serves it unprefixed, but
 * `/en/...` still resolves — and a nav that highlighted nothing on those URLs
 * would be wrong in exactly the case nobody checks.
 */
function normalise(pathname: string): string {
  const stripped = pathname.replace(/^\/en(?=\/|$)/, "");
  return stripped === "" ? "/" : stripped;
}

/**
 * Is this link the page we are on?
 *
 * A section link stays lit for its children — `/rooms` for `/rooms/family` —
 * because "Rooms" is where the visitor is. Home is exact, or it would match
 * every path on the site.
 */
function isCurrent(pathname: string, href: string): boolean {
  const here = normalise(pathname);
  return href === "/" ? here === "/" : here === href || here.startsWith(`${href}/`);
}

export default function Navbar({ locale }: { locale: string }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const menuId = useId();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinks = [
    { href: "/",          label: t("home") },
    { href: "/about",     label: t("about") },
    { href: "/rooms",     label: t("rooms") },
    { href: "/gallery",   label: t("gallery") },
    { href: "/dining",    label: t("dining") },
    { href: "/blog",      label: t("blog") },
    { href: "/contact",   label: t("contact") },
  ];

  // A navigation the menu did not initiate — the back button, the skip link,
  // a link inside the page — used to leave the panel open over the new page.
  useEffect(() => setMobileOpen(false), [pathname]);

  // The page behind an open menu used to scroll under it, which on a phone
  // reads as the menu having come unstuck from the content.
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);

  // Escape closes it, as it does every other overlay on the site.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  /**
   * The current page's link.
   *
   * `aria-current` is what a screen reader announces; the weight and underline
   * are what everyone else sees. Neither existed, so the only way to tell which
   * of seven pages you were on was to read the heading.
   */
  const linkClass = (href: string, base: string) =>
    isCurrent(pathname, href)
      ? `${base} text-primary font-medium underline underline-offset-8 decoration-2 decoration-accent`
      : `${base} text-earth-text hover:text-primary`;

  return (
    <nav
      aria-label={t("primary")}
      className="fixed top-0 left-0 right-0 z-50 bg-earth-white/95 backdrop-blur-sm border-b border-primary-100 shadow-sm"
    >
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
              aria-current={isCurrent(pathname, link.href) ? "page" : undefined}
              className={linkClass(link.href, "font-sans text-sm transition-colors")}
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

        {/* Mobile hamburger. `aria-expanded` and `aria-controls` are what tell a
            screen reader this is a disclosure and whether it is open — without
            them it announced only "Toggle menu", with no way to know what
            pressing it had just done. */}
        <button
          type="button"
          aria-expanded={mobileOpen}
          aria-controls={menuId}
          aria-label={mobileOpen ? t("closeMenu") : t("openMenu")}
          className="lg:hidden p-2 text-earth-text"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
        </button>
      </div>

      {/* Mobile menu. Always rendered so `aria-controls` points at something
          that exists, and hidden with the `hidden` attribute rather than by
          being unmounted — an `aria-controls` naming an absent id is ignored. */}
      <div
        id={menuId}
        hidden={!mobileOpen}
        className="lg:hidden bg-earth-white border-t border-primary-100 py-4"
      >
        <div className="container-resort flex flex-col gap-3">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isCurrent(pathname, link.href) ? "page" : undefined}
              className={linkClass(link.href, "font-sans text-sm py-2 border-b border-primary-50")}
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
    </nav>
  );
}
