/**
 * Photography and marketing copy per room type.
 *
 * Everything factual — name, price, capacity, amenities, how many rooms exist —
 * comes from the database. Only the things the DB does not hold live here.
 *
 * This split exists because the public pages used to carry a hardcoded room
 * list that drifted away from the inventory: the site advertised a "Premium
 * Room" the property does not have, priced the categories differently from the
 * booking wizard, and never mentioned the four Standard rooms at all. A guest
 * could open /rooms/premium-room and press "Book This Room" for a room type
 * that could not be booked.
 *
 * Keyed by `Room.roomType`, so a new room type shows up on the site as soon as
 * it exists in the DB — falling back to `DEFAULT_MARKETING` rather than
 * disappearing.
 */

export type RoomMarketing = {
  /** Badge on the card, when the type has a standout feature. */
  highlight: "Bathtub" | "2 Double Beds" | null;
  rating: number;
  reviews: number;
  heroImage: string;
  heroAlt: string;
  gallery: { src: string; alt: string }[];
  /** Longer copy for the detail page. The short description comes from the DB. */
  longDescription: string;
};

const GENERIC_GALLERY = [
  { src: "/images/rooms/balcony-chairs.jpg", alt: "Private balcony with rattan chairs" },
  { src: "/images/rooms/bathroom-vessel.jpg", alt: "Ensuite bathroom with vessel sink" },
  { src: "/images/rooms/tea-coffee.jpg", alt: "In-room tea and coffee tray" },
];

export const DEFAULT_MARKETING: RoomMarketing = {
  highlight: null,
  rating: 4.7,
  reviews: 0,
  heroImage: "/images/rooms/room-entrance.jpg",
  heroAlt: "Guest room at Rio Casa",
  gallery: GENERIC_GALLERY,
  longDescription:
    "A comfortable room in the hills of Mahabaleshwar, with everything you need for a restful stay.",
};

export const ROOM_MARKETING: Record<string, RoomMarketing> = {
  standard: {
    highlight: null,
    rating: 4.8,
    reviews: 94,
    heroImage: "/images/rooms/deluxe-main.jpg",
    heroAlt: "Standard Room with wood ceiling and double bed",
    gallery: [
      { src: "/images/rooms/deluxe-wardrobe.jpg", alt: "Wardrobe and TV" },
      { src: "/images/rooms/balcony-chairs.jpg", alt: "Private balcony with rattan chairs" },
      { src: "/images/rooms/bathroom-vessel.jpg", alt: "Ensuite bathroom with vessel sink" },
    ],
    longDescription:
      "A beautifully appointed room designed for couples or solo travellers. Warm earthy décor, a comfortable double bed, and all the essentials for a restorative hill station stay.",
  },

  deluxe: {
    highlight: null,
    rating: 4.8,
    reviews: 41,
    heroImage: "/images/rooms/deluxe-entrance.jpg",
    heroAlt: "Deluxe Room entrance",
    gallery: [
      { src: "/images/rooms/balcony-wide.jpg", alt: "Balcony with valley outlook" },
      { src: "/images/rooms/bathroom-grey.jpg", alt: "Ensuite bathroom" },
      { src: "/images/rooms/tea-coffee.jpg", alt: "In-room tea and coffee tray" },
    ],
    longDescription:
      "A step up in space and outlook, with a generous balcony and a quiet position on the upper floor — a comfortable middle ground between our Standard and Luxury rooms.",
  },

  luxury: {
    highlight: "Bathtub",
    rating: 4.9,
    reviews: 36,
    heroImage: "/images/rooms/premium-bed.jpg",
    heroAlt: "Luxury Room with premium bedding",
    gallery: [
      { src: "/images/rooms/premium-bathtub.jpg", alt: "Luxurious soaking bathtub" },
      { src: "/images/rooms/balcony-courtyard.jpg", alt: "Balcony overlooking the courtyard" },
      { src: "/images/rooms/view-forest.jpg", alt: "Forest view from the room" },
    ],
    longDescription:
      "Our finest room, featuring a luxurious soaking bathtub and premium toiletries. Unwind after a day of exploring Mahabaleshwar with a long, relaxing bath.",
  },

  family: {
    highlight: "2 Double Beds",
    rating: 4.9,
    reviews: 28,
    heroImage: "/images/rooms/family-main.jpg",
    heroAlt: "Family Room with two double beds and balcony",
    gallery: [
      { src: "/images/rooms/family-beds.jpg", alt: "Two double beds" },
      { src: "/images/rooms/family-wardrobe.jpg", alt: "Family Room wardrobe and seating" },
      { src: "/images/rooms/balcony-courtyard.jpg", alt: "Balcony overlooking the courtyard" },
    ],
    longDescription:
      "Our spacious family room fits the whole family comfortably with two double beds and a dedicated seating area — ideal for a Mahabaleshwar family holiday.",
  },
};

export function marketingFor(roomType: string): RoomMarketing {
  return ROOM_MARKETING[roomType] ?? DEFAULT_MARKETING;
}
