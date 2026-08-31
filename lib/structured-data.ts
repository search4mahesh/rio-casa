import { absoluteUrl } from "@/lib/site-url";
import type { RoomCategory } from "@/lib/room-catalogue";
import { PROPERTY } from "@/lib/property";

// ─────────────────────────────────────────────────────────────
// schema.org structured data.
//
// This is the piece that matters most for a property selling direct. A
// `Resort` with an address, a price range and room-level offers is what feeds
// Google's hotel and local results — the surfaces where a search for
// "Mahabaleshwar resort" is either answered by the property's own site or by
// an OTA charging it commission for the same booking. The site had none of it.
//
// **Nothing here is invented.** Prices come from the room catalogue, so the
// figure Google shows is the one checkout will charge; the address and contact
// details come from the same strings the footer renders. `geo` is emitted only
// when coordinates are configured, because a plausible-looking guess would put
// the property at the wrong pin on a map.
// ─────────────────────────────────────────────────────────────

export const HOTEL_ID = absoluteUrl("/#hotel");

/** Coordinates, if configured. Omitted rather than guessed — see above. */
function geo() {
  const lat = Number(process.env.NEXT_PUBLIC_HOTEL_LATITUDE);
  const lng = Number(process.env.NEXT_PUBLIC_HOTEL_LONGITUDE);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;

  return { "@type": "GeoCoordinates", latitude: lat, longitude: lng };
}

/**
 * Price range as an actual range over the live catalogue, in the
 * `₹4500-₹9000` form Google reads.
 *
 * Derived rather than hardcoded so it cannot drift from what the site quotes —
 * the same reason `/rooms` reads `getAvailableRooms` rather than querying for
 * itself.
 */
function priceRange(categories: RoomCategory[]): string | undefined {
  if (categories.length === 0) return undefined;
  const prices = categories.map((c) => c.pricePerNight);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  return low === high ? `₹${low}` : `₹${low}-₹${high}`;
}

/**
 * The property itself.
 *
 * `Resort` rather than the broader `Hotel`: it is a subtype of
 * `LodgingBusiness` too, so it satisfies everything that consumes the general
 * type while describing the property more precisely.
 */
export function hotelSchema(opts: {
  categories: RoomCategory[];
  address: string;
  phone: string;
  email: string;
  description: string;
}) {
  const { categories, address, phone, email, description } = opts;

  return {
    "@context": "https://schema.org",
    "@type": "Resort",
    "@id": HOTEL_ID,
    name: PROPERTY.name,
    description,
    url: absoluteUrl("/"),
    telephone: phone,
    email,
    image: [absoluteUrl(PROPERTY.images.og), absoluteUrl(PROPERTY.images.exteriorWide)],
    address: {
      "@type": "PostalAddress",
      streetAddress: address,
      addressLocality: PROPERTY.city,
      addressRegion: PROPERTY.region,
      postalCode: PROPERTY.postalCode,
      addressCountry: PROPERTY.addressCountry,
    },
    geo: geo(),
    priceRange: priceRange(categories),
    currenciesAccepted: "INR",
    paymentAccepted: "Cash, Credit Card, UPI, Net Banking",
    // Matches the copy on /contact and the booking terms. Wrong times here
    // produce a guest who arrives to a locked door with Google's blessing.
    checkinTime: "12:00",
    checkoutTime: "11:00",
    // Only amenities every category has — the same intersection rule that
    // stops `/rooms` advertising one room's forest view on all four (B-55).
    amenityFeature: sharedAmenities(categories).map((name) => ({
      "@type": "LocationFeatureSpecification",
      name,
      value: true,
    })),
    numberOfRooms: categories.reduce((n, c) => n + c.count, 0),
  };
}

/** Amenities present in *every* category, so the property can promise them. */
function sharedAmenities(categories: RoomCategory[]): string[] {
  if (categories.length === 0) return [];
  return categories
    .map((c) => c.amenities)
    .reduce((shared, list) => shared.filter((a) => list.includes(a)));
}

/**
 * A room category as an offer against the property.
 *
 * The price is the category minimum — the same figure the card shows, and one
 * a guest can actually get, rather than an average nobody is ever quoted.
 */
export function roomSchema(category: RoomCategory) {
  return {
    "@context": "https://schema.org",
    "@type": "HotelRoom",
    name: category.name,
    description: category.description,
    url: absoluteUrl(`/rooms/${category.slug}`),
    occupancy: {
      "@type": "QuantitativeValue",
      maxValue: category.maxGuests + (category.extraBed ? 1 : 0),
      unitText: "guests",
    },
    amenityFeature: category.amenities.map((name) => ({
      "@type": "LocationFeatureSpecification",
      name,
      value: true,
    })),
    containedInPlace: { "@id": HOTEL_ID },
    offers: {
      "@type": "Offer",
      price: category.pricePerNight,
      priceCurrency: "INR",
      availability: "https://schema.org/InStock",
      url: absoluteUrl(`/booking?roomType=${category.slug}`),
    },
  };
}

/** Trail for a room detail page, so search results show the path to it. */
export function breadcrumbSchema(trail: Array<{ name: string; path: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((step, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: step.name,
      item: absoluteUrl(step.path),
    })),
  };
}
