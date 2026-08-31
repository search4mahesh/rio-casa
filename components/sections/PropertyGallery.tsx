import Image from "next/image";
import { PROPERTY } from "@/lib/property";

const photos = [
  { src: "/images/hero/exterior-courtyard.jpg",  alt: `${PROPERTY.name} courtyard`,     span: "col-span-2 row-span-2" },
  { src: "/images/rooms/balcony-chairs.jpg",     alt: "Private balcony with rattan chairs", span: "" },
  { src: "/images/rooms/premium-bathtub.jpg",    alt: "Luxury soaking bathtub",         span: "" },
  { src: "/images/hero/exterior-wide.jpg",       alt: "Resort exterior wide view",      span: "col-span-2" },
  { src: "/images/rooms/view-forest.jpg",        alt: "Forest view from room window",   span: "" },
  { src: "/images/rooms/balcony-wide.jpg",       alt: "Balcony with courtyard view",    span: "" },
  { src: "/images/rooms/tea-coffee.jpg",         alt: "In-room tea and coffee station", span: "" },
];

export default function PropertyGallery() {
  return (
    <section className="py-16 bg-earth-white">
      <div className="container-resort">
        <div className="text-center mb-10">
          <p className="section-subheading mb-2">A Closer Look</p>
          <h2 className="section-heading">{PROPERTY.name} in Pictures</h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 auto-rows-[180px]">
          {photos.map((photo) => (
            <div
              key={photo.src}
              className={`relative overflow-hidden rounded-sm ${photo.span}`}
            >
              <Image
                src={photo.src}
                alt={photo.alt}
                fill
                className="object-cover hover:scale-105 transition-transform duration-500"
                sizes="(max-width: 768px) 50vw, 25vw"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
