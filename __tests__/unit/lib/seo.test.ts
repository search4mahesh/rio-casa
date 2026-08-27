import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The site had no sitemap, no robots.txt, no `metadataBase` and no structured
 * data — for a property whose stated goal is direct bookings, the whole
 * acquisition channel was unbuilt.
 *
 * What these pin is the part that is easy to get quietly wrong: URLs must be
 * absolute and correctly joined, and nothing in the schema may be invented.
 */

const ORIGINAL = process.env.NEXT_PUBLIC_SITE_URL;

afterEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL;
  delete process.env.NEXT_PUBLIC_HOTEL_LATITUDE;
  delete process.env.NEXT_PUBLIC_HOTEL_LONGITUDE;
  vi.resetModules();
});

async function freshSiteUrl() {
  vi.resetModules();
  return import("@/lib/site-url");
}

describe("siteUrl", () => {
  it("uses the configured origin", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://riocasa.in";
    const { siteUrl } = await freshSiteUrl();
    expect(siteUrl()).toBe("https://riocasa.in");
  });

  it("strips a trailing slash, so paths never double up", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://riocasa.in/";
    const { siteUrl, absoluteUrl } = await freshSiteUrl();

    expect(siteUrl()).toBe("https://riocasa.in");
    expect(absoluteUrl("/rooms")).toBe("https://riocasa.in/rooms");
  });

  // A build without the variable should emit canonicals that are merely stale,
  // never ones pointing crawlers at a developer's laptop.
  it("falls back to the production domain, not localhost", async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    const { siteUrl } = await freshSiteUrl();

    expect(siteUrl()).toBe("https://riocasa.in");
    expect(siteUrl()).not.toContain("localhost");
  });

  it("treats an empty value as unset", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "   ";
    const { siteUrl } = await freshSiteUrl();
    expect(siteUrl()).toBe("https://riocasa.in");
  });

  it("joins a path with no leading slash", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://riocasa.in";
    const { absoluteUrl } = await freshSiteUrl();
    expect(absoluteUrl("rooms")).toBe("https://riocasa.in/rooms");
  });

  it("metadataBase parses as a URL", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://riocasa.in";
    const { metadataBase } = await freshSiteUrl();
    expect(metadataBase().origin).toBe("https://riocasa.in");
  });
});

describe("hotelSchema", () => {
  const categories = [
    {
      slug: "standard", roomType: "standard", name: "Standard Room",
      description: "A comfortable room.", pricePerNight: 4500, maxGuests: 2,
      extraBed: true, amenities: ["WiFi", "AC", "TV"], someRoomsAmenities: ["Forest View"],
      count: 4, marketing: { heroImage: "/a.jpg", heroAlt: "a" },
    },
    {
      slug: "family", roomType: "family", name: "Family Room",
      description: "Two double beds.", pricePerNight: 9000, maxGuests: 4,
      extraBed: true, amenities: ["WiFi", "AC", "Bathtub"], someRoomsAmenities: [],
      count: 1, marketing: { heroImage: "/b.jpg", heroAlt: "b" },
    },
  ] as never;

  const args = {
    categories,
    address: "Mahabaleshwar, Satara District, Maharashtra — 412806",
    phone: "+91 98765 43210",
    email: "info@riocasa.in",
    description: "A boutique resort.",
  };

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://riocasa.in";
  });

  it("derives the price range from the live catalogue", async () => {
    vi.resetModules();
    const { hotelSchema } = await import("@/lib/structured-data");

    // Not hardcoded: the figure Google shows has to be one checkout charges.
    expect(hotelSchema(args).priceRange).toBe("₹4500-₹9000");
  });

  it("collapses to a single price when every room costs the same", async () => {
    vi.resetModules();
    const { hotelSchema } = await import("@/lib/structured-data");

    const one = [categories[0]] as never;
    expect(hotelSchema({ ...args, categories: one }).priceRange).toBe("₹4500");
  });

  // Same rule as /rooms: a category may only promise what every room has, so
  // the property may only promise what every category has (B-55).
  it("advertises only amenities shared by every category", async () => {
    vi.resetModules();
    const { hotelSchema } = await import("@/lib/structured-data");

    const names = hotelSchema(args).amenityFeature.map((a) => a.name);
    expect(names).toContain("WiFi");
    expect(names).toContain("AC");
    // Standard only.
    expect(names).not.toContain("TV");
    // Family only.
    expect(names).not.toContain("Bathtub");
    // Only some standard rooms have it — never advertised at all.
    expect(names).not.toContain("Forest View");
  });

  it("omits geo when coordinates are not configured, rather than guessing", async () => {
    vi.resetModules();
    const { hotelSchema } = await import("@/lib/structured-data");

    expect(hotelSchema(args).geo).toBeUndefined();
  });

  it("emits geo when both coordinates are configured", async () => {
    process.env.NEXT_PUBLIC_HOTEL_LATITUDE = "17.9307";
    process.env.NEXT_PUBLIC_HOTEL_LONGITUDE = "73.6477";
    vi.resetModules();
    const { hotelSchema } = await import("@/lib/structured-data");

    expect(hotelSchema(args).geo).toEqual({
      "@type": "GeoCoordinates", latitude: 17.9307, longitude: 73.6477,
    });
  });

  it("omits geo when only one coordinate is set — half a pin is a wrong pin", async () => {
    process.env.NEXT_PUBLIC_HOTEL_LATITUDE = "17.9307";
    vi.resetModules();
    const { hotelSchema } = await import("@/lib/structured-data");

    expect(hotelSchema(args).geo).toBeUndefined();
  });

  it("counts every room in the property", async () => {
    vi.resetModules();
    const { hotelSchema } = await import("@/lib/structured-data");
    expect(hotelSchema(args).numberOfRooms).toBe(5);
  });

  it("uses absolute URLs throughout — a relative one is meaningless to a crawler", async () => {
    vi.resetModules();
    const { hotelSchema } = await import("@/lib/structured-data");
    const schema = hotelSchema(args);

    expect(schema.url).toBe("https://riocasa.in/");
    for (const img of schema.image) expect(img.startsWith("https://riocasa.in/")).toBe(true);
  });
});

describe("roomSchema", () => {
  const category = {
    slug: "family", roomType: "family", name: "Family Room",
    description: "Two double beds.", pricePerNight: 9000, maxGuests: 4,
    extraBed: true, amenities: ["WiFi", "AC"], someRoomsAmenities: [],
    count: 1, marketing: { heroImage: "/b.jpg", heroAlt: "b" },
  } as never;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://riocasa.in";
  });

  it("prices the offer at the category minimum, in INR", async () => {
    vi.resetModules();
    const { roomSchema } = await import("@/lib/structured-data");
    const schema = roomSchema(category);

    expect(schema.offers.price).toBe(9000);
    expect(schema.offers.priceCurrency).toBe("INR");
  });

  // Capacity, pricing and availability all have to agree that a room sleeps
  // maxGuests + 1 with a rollaway — see CLAUDE.md.
  it("counts the extra bed in the stated occupancy", async () => {
    vi.resetModules();
    const { roomSchema } = await import("@/lib/structured-data");

    expect(roomSchema(category).occupancy.maxValue).toBe(5);
  });

  it("leaves occupancy at maxGuests when there is no extra bed", async () => {
    vi.resetModules();
    const { roomSchema } = await import("@/lib/structured-data");

    const noBed = { ...(category as object), extraBed: false } as never;
    expect(roomSchema(noBed).occupancy.maxValue).toBe(4);
  });

  it("ties the room to the property node rather than restating it", async () => {
    vi.resetModules();
    const { roomSchema, HOTEL_ID } = await import("@/lib/structured-data");

    expect(roomSchema(category).containedInPlace).toEqual({ "@id": HOTEL_ID });
  });
});

describe("breadcrumbSchema", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://riocasa.in";
  });

  it("numbers positions from one and absolutises each step", async () => {
    vi.resetModules();
    const { breadcrumbSchema } = await import("@/lib/structured-data");

    const trail = breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Rooms", path: "/rooms" },
    ]);

    expect(trail.itemListElement[0].position).toBe(1);
    expect(trail.itemListElement[1].position).toBe(2);
    expect(trail.itemListElement[1].item).toBe("https://riocasa.in/rooms");
  });
});
