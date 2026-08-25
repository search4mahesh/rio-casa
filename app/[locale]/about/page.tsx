import { useTranslations } from "next-intl";
import { Leaf, Heart, Mountain } from "lucide-react";
import { pageMetadata } from "@/lib/page-metadata";

export const generateMetadata = () => pageMetadata("about");

export default function AboutPage() {
  const t = useTranslations("about");

  return (
    <div className="min-h-screen bg-earth-bg">
      {/* Hero */}
      <section className="py-20 bg-primary text-earth-white text-center">
        <p className="section-subheading text-accent mb-2">{t("subtitle")}</p>
        <h1 className="font-serif text-4xl md:text-6xl text-earth-white">{t("title")}</h1>
      </section>

      {/* Story */}
      <section className="py-16">
        <div className="container-resort max-w-3xl text-center">
          <p className="font-serif text-xl leading-relaxed text-earth-text/80 mb-6">
            Nestled in the misty Sahyadri mountains, Rio Casa was born from a simple dream — to create a sanctuary where nature, luxury, and warm Maharashtrian hospitality come together seamlessly.
          </p>
          <p className="font-sans text-earth-text/60 leading-relaxed">
            What started as a family retreat in the heart of Mahabaleshwar has grown into one of the hill station&rsquo;s most beloved boutique resorts. Every room, every corner, every meal at Rio Casa is crafted with an intent — to make you feel at home, 120 km from the city.
          </p>
        </div>
      </section>

      {/* Values */}
      <section className="py-16 bg-primary-50/40">
        <div className="container-resort">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { icon: Leaf, title: "Sustainable", desc: "We use eco-friendly practices — rainwater harvesting, solar energy, and farm-to-table dining." },
              { icon: Heart, title: "Heartfelt Service", desc: "Our team of local Mahabaleshwar staff brings genuine warmth to every guest interaction." },
              { icon: Mountain, title: "Nature First", desc: "Designed to complement the landscape, not compete with it. Views are our best amenity." },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="text-center">
                <div className="w-14 h-14 rounded-full bg-primary-100 flex items-center justify-center mx-auto mb-4">
                  <Icon size={24} className="text-primary" />
                </div>
                <h3 className="font-serif text-xl mb-2">{title}</h3>
                <p className="font-sans text-sm text-earth-text/60 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Mahabaleshwar section */}
      <section className="py-16">
        <div className="container-resort max-w-3xl text-center">
          <h2 className="section-heading mb-6">{t("mahabaleshwarTitle")}</h2>
          <p className="font-sans text-earth-text/60 leading-relaxed mb-8">
            Mahabaleshwar is Maharashtra&rsquo;s crown jewel of hill stations. Famous for its strawberry farms, viewpoints like Arthur&rsquo;s Seat and Elephant&rsquo;s Head, Venna Lake boating, and the ancient Mahabaleshwar Temple — it&rsquo;s a destination that calls you back every season.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            {["Strawberry Farms", "Venna Lake", "Viewpoints", "Horse Riding"].map((activity) => (
              <div key={activity} className="bg-earth-white rounded-sm py-4 px-3 shadow-sm">
                <p className="font-serif text-sm text-primary">{activity}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
