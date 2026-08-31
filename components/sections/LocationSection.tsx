import { useTranslations } from "next-intl";
import { MapPin, Clock } from "lucide-react";
import { PROPERTY } from "@/lib/property";

const distances = [
  { from: "Pune", km: "120 km", time: "3 hrs" },
  { from: "Mumbai", km: "285 km", time: "6 hrs" },
  { from: "Nashik", km: "230 km", time: "5 hrs" },
  { from: "Kolhapur", km: "165 km", time: "4 hrs" },
];

export default function LocationSection() {
  const t = useTranslations("home");

  return (
    <section className="py-20 bg-earth-bg">
      <div className="container-resort">
        <div className="text-center mb-12">
          <p className="section-subheading mb-2">{t("locationSubtitle", { city: PROPERTY.city })}</p>
          <h2 className="section-heading">{t("locationTitle")}</h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          {/* Map embed */}
          <div className="rounded-sm overflow-hidden shadow-sm h-80 bg-primary-100 flex items-center justify-center">
            <iframe
              src={PROPERTY.mapEmbedUrl}
              width="100%"
              height="100%"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              title={`${PROPERTY.name} location`}
            />
          </div>

          {/* Distance info */}
          <div>
            <div className="flex items-center gap-2 mb-6">
              <MapPin size={18} className="text-primary" />
              <p className="font-sans text-sm text-earth-text/70">
                {PROPERTY.address}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {distances.map((d) => (
                <div key={d.from} className="bg-earth-white rounded-sm p-4 shadow-sm">
                  <p className="font-serif text-lg text-primary mb-1">{d.from}</p>
                  <div className="flex items-center gap-3 text-sm text-earth-text/70">
                    <span>{d.km}</span>
                    <span>·</span>
                    <div className="flex items-center gap-1">
                      <Clock size={12} />
                      <span>{d.time}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
