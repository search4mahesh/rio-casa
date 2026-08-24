import Link from "next/link";
import { useTranslations } from "next-intl";
import { MapPin, Phone, Mail } from "lucide-react";

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

  return (
    <footer className="bg-earth-text text-earth-white/80">
      <div className="container-resort py-14">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          {/* Brand */}
          <div className="md:col-span-1">
            <p className="font-serif text-2xl text-earth-white mb-2">Rio Casa</p>
            <p className="text-xs tracking-widest uppercase text-accent mb-4">Mahabaleshwar</p>
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
                    className="hover:text-accent transition-colors"
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
                <MapPin size={15} className="mt-0.5 shrink-0 text-accent" />
                <span>{t("address")}</span>
              </li>
              <li className="flex items-center gap-2">
                <Phone size={15} className="shrink-0 text-accent" />
                {/* Strip the display spacing — a tel: URI must be dialable. */}
                <a href={`tel:${t("phone").replace(/[^\d+]/g, "")}`} className="hover:text-accent transition-colors">
                  {t("phone")}
                </a>
              </li>
              <li className="flex items-center gap-2">
                <Mail size={15} className="shrink-0 text-accent" />
                <a href={`mailto:${t("email")}`} className="hover:text-accent transition-colors">
                  {t("email")}
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
                href="https://instagram.com/riocasamahabaleshwar"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-full border border-earth-white/20 flex items-center justify-center hover:bg-accent hover:border-accent transition-colors"
                aria-label="Instagram"
              >
                <InstagramIcon />
              </a>
              <a
                href="https://facebook.com/riocasamahabaleshwar"
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
          <p>{t("copyright", { year })}</p>
          <Link href={`${prefix}/privacy`} className="hover:text-earth-white/80 transition-colors">
            {t("privacyPolicy")}
          </Link>
        </div>
      </div>
    </footer>
  );
}
