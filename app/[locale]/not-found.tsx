import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Compass } from "lucide-react";

/**
 * Public 404 — reached by `notFound()` from a page, and by any unmatched path
 * under a locale.
 *
 * `/rooms/[slug]` calls `notFound()` for a room type the property does not
 * have, which until now rendered Next's default 404: unstyled, no navbar, no
 * way back to the rooms that *do* exist. Given the path that most often
 * arrives here, "browse our rooms" is the more useful of the two exits.
 *
 * A server component, so the copy comes from `getTranslations` rather than the
 * client hook — the same split every other public page uses.
 */
export default async function NotFound() {
  const t = await getTranslations("error");

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-20">
      <div className="text-center max-w-md">
        <Compass size={36} className="mx-auto mb-5 text-accent" aria-hidden="true" />
        <p className="font-sans text-sm tracking-[0.3em] uppercase text-accent mb-3">404</p>
        <h1 className="font-serif text-3xl text-earth-text mb-3">{t("notFoundTitle")}</h1>
        <p className="font-sans text-sm text-earth-text/70 mb-8">{t("notFoundBody")}</p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/rooms" className="btn-primary px-6 py-3">
            {t("notFoundRooms")}
          </Link>
          <Link href="/" className="btn-outline px-6 py-3">
            {t("home")}
          </Link>
        </div>
      </div>
    </div>
  );
}
