import { Waves, Flame, UtensilsCrossed, Mountain, Car, Wifi } from "lucide-react";

const amenities = [
  { icon: Waves, label: "Swimming Pool" },
  { icon: Flame, label: "Bonfire" },
  { icon: UtensilsCrossed, label: "Restaurant" },
  { icon: Mountain, label: "Nature Walks" },
  { icon: Car, label: "Free Parking" },
  { icon: Wifi, label: "Free Wi-Fi" },
];

export default function AmenitiesStrip() {
  return (
    <section className="bg-primary py-8">
      <div className="container-resort">
        <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
          {amenities.map(({ icon: Icon, label }) => (
            <div key={label} className="flex flex-col items-center gap-2 text-earth-white">
              <Icon size={24} strokeWidth={1.5} />
              <span className="font-sans text-xs tracking-wide text-center">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
