/**
 * B-55 — the room card promised what the booking did not deliver.
 *
 * `getRoomCategories` merges the rooms of a type into one card. Price was
 * already merged honestly — the category **minimum**, "so the headline figure
 * is one a guest can actually get" — but amenities were merged as a **union**,
 * which breaks the same principle. "Forest View" is on one of four standard
 * rooms, so `/rooms` advertised a view three guests in four would not get.
 *
 * The guest never picks a door number: the wizard shows one card per type and
 * allocates a specific room. So the page that sells the room and the page that
 * books it have to agree about what the room comes with.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRoomFindMany } = vi.hoisted(() => ({ mockRoomFindMany: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: { room: { findMany: mockRoomFindMany } } }));
vi.mock("@/lib/room-marketing", () => ({
  marketingFor: () => ({ tagline: "", highlight: "", rating: 4.8, reviews: 10, gallery: [], longDescription: "" }),
}));

import { getRoomCategories, getRoomCategory } from "@/lib/room-catalogue";

const BASE = { descriptionEn: "A room", maxGuests: 2, extraBed: true };

/** Four standard rooms, one of which has a forest view — the live shape. */
const STANDARDS = [
  { ...BASE, roomType: "standard", name: "Standard Room", pricePerNight: 4500, amenities: ["AC", "WiFi", "TV"] },
  { ...BASE, roomType: "standard", name: "Standard Room", pricePerNight: 4500, amenities: ["AC", "WiFi", "TV"] },
  { ...BASE, roomType: "standard", name: "Standard Room", pricePerNight: 4500, amenities: ["AC", "WiFi", "TV"] },
  { ...BASE, roomType: "standard", name: "Standard Room", pricePerNight: 4500, amenities: ["AC", "WiFi", "TV", "Forest View"] },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockRoomFindMany.mockResolvedValue(STANDARDS);
});

describe("getRoomCategories — amenities a guest is actually guaranteed (B-55)", () => {
  it("does not advertise an amenity only one room in the category has", async () => {
    const [standard] = await getRoomCategories();

    expect(standard.amenities).toEqual(["AC", "WiFi", "TV"]);
    // The bug: "Forest View" sat in this list, promising every guest a view.
    expect(standard.amenities).not.toContain("Forest View");
  });

  it("keeps the odd one out rather than dropping it — the room does exist", async () => {
    const [standard] = await getRoomCategories();
    expect(standard.someRoomsAmenities).toEqual(["Forest View"]);
  });

  it("puts every amenity in exactly one of the two lists", async () => {
    const [standard] = await getRoomCategories();
    const overlap = standard.amenities.filter((a) => standard.someRoomsAmenities.includes(a));
    expect(overlap).toEqual([]);
  });

  it("guarantees everything when the rooms of a type are identical", async () => {
    mockRoomFindMany.mockResolvedValue([
      { ...BASE, roomType: "deluxe", name: "Deluxe", pricePerNight: 5500, amenities: ["AC", "Balcony"] },
      { ...BASE, roomType: "deluxe", name: "Deluxe", pricePerNight: 5500, amenities: ["AC", "Balcony"] },
    ]);
    const [deluxe] = await getRoomCategories();

    expect(deluxe.amenities).toEqual(["AC", "Balcony"]);
    expect(deluxe.someRoomsAmenities).toEqual([]);
  });

  it("guarantees a lone room's amenities — nothing to disagree with", async () => {
    mockRoomFindMany.mockResolvedValue([
      { ...BASE, roomType: "family", name: "Family", pricePerNight: 7500, maxGuests: 4, amenities: ["AC", "2 Double Beds"] },
    ]);
    const [family] = await getRoomCategories();

    expect(family.amenities).toEqual(["AC", "2 Double Beds"]);
    expect(family.someRoomsAmenities).toEqual([]);
  });
});

describe("getRoomCategories — the merges that were already right", () => {
  it("still advertises the price of the cheapest room in the category", async () => {
    mockRoomFindMany.mockResolvedValue([
      { ...BASE, roomType: "standard", name: "Standard", pricePerNight: 4500, amenities: ["AC"] },
      { ...BASE, roomType: "standard", name: "Standard", pricePerNight: 6000, amenities: ["AC"] },
    ]);
    const [standard] = await getRoomCategories();

    // A guest must be able to get the advertised figure.
    expect(standard.pricePerNight).toBe(4500);
    expect(standard.count).toBe(2);
  });

  it("still advertises the widest capacity in the category", async () => {
    mockRoomFindMany.mockResolvedValue([
      { ...BASE, roomType: "family", name: "Family", pricePerNight: 7500, maxGuests: 2, amenities: ["AC"] },
      { ...BASE, roomType: "family", name: "Family", pricePerNight: 7500, maxGuests: 4, amenities: ["AC"] },
    ]);
    const [family] = await getRoomCategories();
    expect(family.maxGuests).toBe(4);
  });

  it("resolves a slug to its category", async () => {
    expect(await getRoomCategory("standard")).toMatchObject({ slug: "standard" });
    expect(await getRoomCategory("premium-room")).toBeNull();
  });
});
