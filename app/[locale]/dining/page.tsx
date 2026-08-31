import { useTranslations } from "next-intl";
import { Waves, Wifi, Car, Trees } from "lucide-react";
import { pageMetadata } from "@/lib/page-metadata";

export const generateMetadata = () => pageMetadata("dining", "/dining");

// Only what the property actually has. The pool is under construction, so it
// carries the same "Coming Soon" badge as the home-page strip rather than being
// described in the present tense; Nature Walks are unguided, so the card names
// them and claims nothing further.
const amenities: { icon: typeof Waves; name: string; desc?: string; comingSoon?: boolean }[] = [
  { icon: Waves, name: "Swimming Pool", desc: "Temperature-controlled outdoor pool with valley views.", comingSoon: true },
  { icon: Wifi, name: "Free Wi-Fi", desc: "High-speed internet across the entire property." },
  { icon: Car, name: "Free Parking", desc: "Secure covered parking for all guests." },
  { icon: Trees, name: "Nature Walks" },
];

const nearbyActivities = [
  { name: "Venna Lake Boating", distance: "3 km" },
  { name: "Elephant Head Point", distance: "6 km" },
  { name: "Mapro Garden", distance: "4 km" },
  { name: "Arthur's Seat Viewpoint", distance: "9 km" },
  { name: "Pratapgad Fort", distance: "24 km" },
  { name: "Lingmala Waterfall", distance: "7 km" },
];

export default function DiningPage() {
  const t = useTranslations("dining");

  return (
    <div className="min-h-screen bg-earth-bg">
      {/* Hero */}
      <section className="py-20 bg-earth-text text-center">
        <p className="section-subheading text-accent mb-2">{t("subtitle")}</p>
        <h1 className="font-serif text-4xl md:text-5xl text-earth-white">{t("title")}</h1>
      </section>

      {/* Restaurant */}
      <section className="py-16">
        <div className="container-resort">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="section-heading mb-4">{t("restaurant")}</h2>
              <p className="font-sans text-earth-text/70 leading-relaxed mb-4">
                Our restaurant celebrates the rich culinary heritage of Maharashtra. From a wholesome Misal Pav breakfast to hearty Kolhapuri curries for lunch and an à-la-carte dinner menu featuring fresh valley produce — every meal is an experience.
              </p>
              <p className="font-sans text-earth-text/70 leading-relaxed mb-6">
                Seasonal specials include strawberry desserts (May), corn dishes (July), and hot soup evenings all year round.
              </p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between border-b border-primary-50 pb-2">
                  <span className="font-sans text-earth-text/70">Breakfast</span>
                  <span className="font-sans font-medium">7:00 AM – 10:30 AM</span>
                </div>
                <div className="flex justify-between border-b border-primary-50 pb-2">
                  <span className="font-sans text-earth-text/70">Lunch</span>
                  <span className="font-sans font-medium">12:30 PM – 3:00 PM</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-sans text-earth-text/70">Dinner</span>
                  <span className="font-sans font-medium">7:30 PM – 10:30 PM</span>
                </div>
              </div>
            </div>
            <div className="h-72 bg-primary-100 rounded-sm flex items-center justify-center text-primary-400">
              Restaurant Photo
            </div>
          </div>
        </div>
      </section>

      {/* Amenities */}
      <section className="py-16 bg-primary-50/30">
        <div className="container-resort">
          <h2 className="section-heading text-center mb-12">{t("amenitiesTitle")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {amenities.map(({ icon: Icon, name, desc, comingSoon }) => (
              <div key={name} className="bg-earth-white rounded-sm p-6 shadow-sm relative">
                {comingSoon && (
                  <span className="absolute top-4 right-4 bg-accent text-white text-[10px] font-sans font-semibold px-2 py-0.5 rounded-full leading-tight">
                    Coming Soon
                  </span>
                )}
                <div className="w-12 h-12 rounded-full bg-primary-50 flex items-center justify-center mb-4">
                  <Icon size={22} className="text-primary" />
                </div>
                <h3 className={`font-serif text-lg${desc ? " mb-2" : ""}`}>{name}</h3>
                {desc && <p className="font-sans text-sm text-earth-text/70">{desc}</p>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Nearby activities */}
      <section className="py-16">
        <div className="container-resort max-w-2xl">
          <h2 className="section-heading text-center mb-10">{t("activitiesTitle")}</h2>
          <div className="grid grid-cols-2 gap-3">
            {nearbyActivities.map(({ name, distance }) => (
              <div key={name} className="bg-earth-white rounded-sm px-4 py-3 shadow-sm flex items-center justify-between">
                <span className="font-sans text-sm text-earth-text">{name}</span>
                <span className="font-sans text-xs text-primary font-medium">{distance}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
