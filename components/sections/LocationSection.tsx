import { useTranslations } from "next-intl";
import { MapPin, Clock } from "lucide-react";

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
          <p className="section-subheading mb-2">{t("locationSubtitle")}</p>
          <h2 className="section-heading">{t("locationTitle")}</h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          {/* Map embed */}
          <div className="rounded-sm overflow-hidden shadow-sm h-80 bg-primary-100 flex items-center justify-center">
            <iframe
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d30382.48!2d73.6579!3d17.9237!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3bc23e44e0c78083%3A0x4d52534b5ed33ef4!2sMahabaleshwar%2C%20Maharashtra!5e0!3m2!1sen!2sin!4v1680000000000!5m2!1sen!2sin"
              width="100%"
              height="100%"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              title="Rio Casa Location"
            />
          </div>

          {/* Distance info */}
          <div>
            <div className="flex items-center gap-2 mb-6">
              <MapPin size={18} className="text-primary" />
              <p className="font-sans text-sm text-earth-text/70">
                Mahabaleshwar, Satara District, Maharashtra — 412806
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
