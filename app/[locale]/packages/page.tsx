import Link from "next/link";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";

const packages = [
  {
    id: "honeymoon",
    name: "Honeymoon Escape",
    price: 18000,
    duration: "2 nights / 3 days",
    description: "A romantic sojourn crafted for two — rose-petal décor, candle-lit dinner, and spa.",
    inclusions: [
      "Premium Valley Suite (2 nights)",
      "Rose petal turn-down service",
      "Candle-lit private dinner",
      "Couple spa session (60 min)",
      "Breakfast in bed",
      "Late check-out (2 PM)",
    ],
    badge: "Most Popular",
    badgeColor: "bg-accent text-white",
  },
  {
    id: "weekend-getaway",
    name: "Weekend Getaway",
    price: 9500,
    duration: "2 nights / 3 days",
    description: "The perfect quick escape from city life — relax, explore, and unwind.",
    inclusions: [
      "Deluxe Garden View Room (2 nights)",
      "Complimentary breakfast",
      "Welcome drink on arrival",
      "1 nature walk guided tour",
      "Bonfire evening",
    ],
    badge: null,
    badgeColor: "",
  },
  {
    id: "corporate-retreat",
    name: "Corporate Retreat",
    price: 45000,
    duration: "2 nights / 3 days (per 10 pax)",
    description: "Rejuvenate your team with a productive, scenic retreat in the hills.",
    inclusions: [
      "Group accommodation (5 rooms, 2 nights)",
      "Conference hall setup",
      "All meals included",
      "Team-building activities",
      "Airport / station pickup",
      "Dedicated event coordinator",
    ],
    badge: "Best for Groups",
    badgeColor: "bg-primary text-white",
  },
  {
    id: "monsoon-magic",
    name: "Monsoon Magic",
    price: 11000,
    duration: "2 nights / 3 days",
    description: "Experience Mahabaleshwar at its lush green best — magical monsoon views included.",
    inclusions: [
      "Premium Valley Suite (2 nights)",
      "Breakfast + dinner",
      "Monsoon trek experience",
      "Hot chocolate welcome",
      "Complimentary rain poncho",
    ],
    badge: "Jul–Sep only",
    badgeColor: "bg-blue-500 text-white",
  },
];

export default function PackagesPage({ params }: { params: { locale: string } }) {
  const t = useTranslations("packages");
  const prefix = params.locale !== "en" ? `/${params.locale}` : "";

  return (
    <div className="min-h-screen bg-earth-bg py-16">
      <div className="container-resort">
        <div className="text-center mb-14">
          <p className="section-subheading mb-2">{t("subtitle")}</p>
          <h1 className="section-heading">{t("title")}</h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {packages.map((pkg) => (
            <div key={pkg.id} className="bg-earth-white rounded-sm shadow-sm overflow-hidden relative">
              {pkg.badge && (
                <span className={`absolute top-4 right-4 text-xs font-sans font-semibold px-3 py-1 rounded-full ${pkg.badgeColor}`}>
                  {pkg.badge}
                </span>
              )}
              <div className="h-40 bg-primary-100 flex items-center justify-center text-primary-400 text-sm">
                Package Image
              </div>
              <div className="p-6">
                <h2 className="font-serif text-2xl text-earth-text mb-1">{pkg.name}</h2>
                <p className="font-sans text-xs text-earth-text/50 mb-3">{pkg.duration}</p>
                <p className="font-sans text-sm text-earth-text/70 mb-4">{pkg.description}</p>

                <div className="mb-5">
                  <p className="font-sans text-xs font-semibold uppercase tracking-wider text-earth-text/50 mb-2">{t("includes")}</p>
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
                    <span className="font-sans text-xs text-earth-text/50 ml-1">onwards</span>
                  </div>
                  <Link href={`${prefix}/booking`} className="btn-primary text-sm py-2 px-5">
                    {t("bookPackage")}
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
