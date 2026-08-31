"use client";

import { Waves, UtensilsCrossed, Mountain, Car, Wifi } from "lucide-react";

const amenities = [
  { icon: Waves,            label: "Swimming Pool", comingSoon: true  },
  { icon: UtensilsCrossed,  label: "Restaurant",     comingSoon: false },
  { icon: Mountain,         label: "Nature Walks",   comingSoon: false },
  { icon: Car,              label: "Free Parking",   comingSoon: false },
  { icon: Wifi,             label: "Free Wi-Fi",     comingSoon: false },
];

export default function AmenitiesStrip() {
  return (
    <section className="bg-primary py-8">
      <div className="container-resort">
        <div className="grid grid-cols-3 md:grid-cols-5 gap-4">
          {amenities.map(({ icon: Icon, label, comingSoon }) => (
            <div key={label} className="flex flex-col items-center gap-2">
              {comingSoon ? (
                <div className="relative flex flex-col items-center gap-2 opacity-60">
                  <Icon size={24} strokeWidth={1.5} className="text-earth-white" />
                  <span className="font-sans text-xs tracking-wide text-center text-earth-white">
                    {label}
                  </span>
                  <span className="absolute -top-2 -right-4 bg-accent text-white text-[9px] font-sans font-semibold px-1.5 py-0.5 rounded-full leading-tight whitespace-nowrap">
                    Coming Soon
                  </span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-earth-white">
                  <Icon size={24} strokeWidth={1.5} />
                  <span className="font-sans text-xs tracking-wide text-center">{label}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
