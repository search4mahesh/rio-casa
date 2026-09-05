"use client";

import { useTranslations } from "next-intl";

/**
 * The first tab stop on every page: a way past the header.
 *
 * A keyboard user reached the content of any page through eight tab stops —
 * seven navigation links and "Book Now" — repeated on every page they visited.
 *
 * Hidden until focused rather than always visible, and it must *become*
 * visible: a skip link that stays `sr-only` when focused is worse than none,
 * because a sighted keyboard user sees their focus vanish into nothing.
 */
export default function SkipLink() {
  const t = useTranslations("nav");

  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60]
                 focus:bg-primary focus:text-earth-white focus:px-4 focus:py-2 focus:rounded-sm
                 focus:font-sans focus:text-sm focus:shadow-lg"
    >
      {t("skipToContent")}
    </a>
  );
}
