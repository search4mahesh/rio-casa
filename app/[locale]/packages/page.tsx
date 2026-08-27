import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Check } from "lucide-react";
import { pageMetadata } from "@/lib/page-metadata";
import { getPackages } from "@/lib/site-content";
import { ErrorState } from "@/components/ui/ErrorState";

export const generateMetadata = () => pageMetadata("packages", "/packages");

// Packages come from the database, not a literal in this file. The two used to
// disagree outright — this page advertised Honeymoon Escape, Weekend Getaway
// and Corporate Retreat, none of which existed in `packages`, while Romantic
// Getaway and Family Fun Pack sat there unadvertised, and Monsoon Magic
// appeared in both at two different prices (B-53). Editing a price was a code
// change and a deploy.
//
// Dynamic for the same reason /rooms is: the content is editable from the
// admin panel, and a statically-rendered page would keep serving yesterday's
// prices until the next deploy.
export const dynamic = "force-dynamic";

export default async function PackagesPage({ params }: { params: { locale: string } }) {
  const t = await getTranslations("packages");
  const prefix = "";

  // A failed load must not fall through to an empty grid: "no packages" tells a
  // visitor the property offers none, when in truth we never managed to ask.
  let packages: Awaited<ReturnType<typeof getPackages>> = [];
  let loadFailed = false;
  try {
    packages = await getPackages();
  } catch (err) {
    console.error("[packages] Could not load packages.", err);
    loadFailed = true;
  }

  return (
    <div className="min-h-screen bg-earth-bg py-16">
      <div className="container-resort">
        <div className="text-center mb-14">
          <p className="section-subheading mb-2">{t("subtitle")}</p>
          <h1 className="section-heading">{t("title")}</h1>
        </div>

        {loadFailed ? (
          <ErrorState message={t("loadError")} />
        ) : packages.length === 0 ? (
          <p className="text-center font-sans text-sm text-earth-text/70 py-12">{t("none")}</p>
        ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {packages.map((pkg) => (
            <div key={pkg.id} className="bg-earth-white rounded-sm shadow-sm overflow-hidden relative">
              {/* Derived from validFrom/validTo, so a seasonal package stops
                  advertising itself instead of waiting for someone to delete a
                  hardcoded badge. */}
              {pkg.availability && (
                <span className="absolute top-4 right-4 text-xs font-sans font-semibold px-3 py-1 rounded-full bg-accent text-white">
                  {pkg.availability}
                </span>
              )}
              <div className="h-40 bg-primary-100 flex items-center justify-center text-primary-400 text-sm">
                Package Image
              </div>
              <div className="p-6">
                <h2 className="font-serif text-2xl text-earth-text mb-1">{pkg.name}</h2>
                <p className="font-sans text-sm text-earth-text/70 mb-4">{pkg.description}</p>

                <div className="mb-5">
                  <p className="font-sans text-xs font-semibold uppercase tracking-wider text-earth-text/70 mb-2">{t("includes")}</p>
                  <ul className="space-y-1.5">
                    {pkg.inclusions.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm text-earth-text/70">
                        <Check size={14} className="text-primary mt-0.5 shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-primary-50">
                  <div>
                    <span className="font-serif text-2xl text-primary">₹{pkg.price.toLocaleString("en-IN")}</span>
                    <span className="font-sans text-xs text-earth-text/70 ml-1">onwards</span>
                  </div>
                  <Link href={`${prefix}/booking`} className="btn-primary text-sm py-2 px-5">
                    {t("bookPackage")}
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
        )}
      </div>
    </div>
  );
}
