import Link from "next/link";
import { useTranslations } from "next-intl";
import { MapPin, Phone, Mail } from "lucide-react";
import { PROPERTY, telHref } from "@/lib/property";

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
      <circle cx="12" cy="12" r="4"/>
      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor"/>
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
    </svg>
  );
}

export default function Footer({ locale }: { locale: string }) {
  const t = useTranslations("footer");
  const nav = useTranslations("nav");
  const year = new Date().getFullYear();

  const prefix = "";

  // The accent gold below is `accent-300`, not `accent`: the brand gold
  // (#8B6914) is 3.01:1 on this footer's dark ground, well under WCAG AA,
  // while accent-300 is 7.73:1. On the light pages `accent` itself is fine —
  // the shade has to follow the background it sits on.
  return (
    <footer className="bg-earth-text text-earth-white/80">
      <div className="container-resort py-14">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          {/* Brand */}
          <div className="md:col-span-1">
            <p className="font-serif text-2xl text-earth-white mb-2">{PROPERTY.name}</p>
            <p className="text-xs tracking-widest uppercase text-accent-300 mb-4">{PROPERTY.city}</p>
            <p className="text-sm leading-relaxed">{t("tagline")}</p>
          </div>

          {/* Quick links */}
          <div>
            <p className="font-sans font-semibold text-earth-white mb-4 uppercase tracking-wider text-xs">
              {t("quickLinks")}
            </p>
            <ul className="space-y-2 text-sm">
              {[
                ["home", "/"],
                ["about", "/about"],
                ["rooms", "/rooms"],
                ["gallery", "/gallery"],
                ["packages", "/packages"],
                ["dining", "/dining"],
                ["blog", "/blog"],
                ["contact", "/contact"],
              ].map(([key, href]) => (
                <li key={key}>
                  <Link
                    href={`${prefix}${href}`}
                    className="hover:text-accent-300 transition-colors"
                  >
                    {nav(key as Parameters<typeof nav>[0])}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <p className="font-sans font-semibold text-earth-white mb-4 uppercase tracking-wider text-xs">
              {t("contact")}
            </p>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-2">
                <MapPin size={15} className="mt-0.5 shrink-0 text-accent-300" />
                <span>{PROPERTY.address}</span>
              </li>
              <li className="flex items-center gap-2">
                <Phone size={15} className="shrink-0 text-accent-300" />
                {/* telHref strips the display spacing — a tel: URI must be dialable. */}
                <a href={telHref()} className="hover:text-accent-300 transition-colors">
                  {PROPERTY.phone}
                </a>
              </li>
              <li className="flex items-center gap-2">
                <Mail size={15} className="shrink-0 text-accent-300" />
                <a href={`mailto:${PROPERTY.email}`} className="hover:text-accent-300 transition-colors">
                  {PROPERTY.email}
                </a>
              </li>
            </ul>
          </div>

          {/* Social */}
          <div>
            <p className="font-sans font-semibold text-earth-white mb-4 uppercase tracking-wider text-xs">
              {t("followUs")}
            </p>
            <div className="flex gap-3">
              <a
                href={PROPERTY.social.instagram}
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-full border border-earth-white/20 flex items-center justify-center hover:bg-accent hover:border-accent transition-colors"
                aria-label="Instagram"
              >
                <InstagramIcon />
              </a>
              <a
                href={PROPERTY.social.facebook}
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-full border border-earth-white/20 flex items-center justify-center hover:bg-accent hover:border-accent transition-colors"
                aria-label="Facebook"
              >
                <FacebookIcon />
              </a>
            </div>
          </div>
        </div>

        <div className="border-t border-earth-white/10 mt-10 pt-6 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-earth-white/50">
          <p>{t("copyright", { year, property: PROPERTY.name })}</p>
          <Link href={`${prefix}/privacy`} className="hover:text-earth-white/80 transition-colors">
            {t("privacyPolicy")}
          </Link>
        </div>
      </div>
    </footer>
  );
}
