import { prisma } from "@/lib/prisma";
import { marketingFor, type RoomMarketing } from "@/lib/room-marketing";

/**
 * The room categories a guest can actually book, derived from live inventory.
 *
 * The public site groups by `roomType` — guests choose a kind of room, not a
 * specific door number — while the booking wizard allocates an individual room.
 * Both now read the same source, so the site can no longer advertise a category
 * that does not exist or price it differently from checkout.
 */
export type RoomCategory = {
  /** URL slug — the room type itself, so /rooms/<slug> is always resolvable. */
  slug: string;
  roomType: string;
  name: string;
  description: string;
  pricePerNight: number;
  maxGuests: number;
  extraBed: boolean;
  amenities: string[];
  /** How many physical rooms of this type are active. */
  count: number;
  marketing: RoomMarketing;
};

export async function getRoomCategories(): Promise<RoomCategory[]> {
  const rooms = await prisma.room.findMany({
    where: { isActive: true },
    orderBy: [{ pricePerNight: "asc" }, { roomNumber: "asc" }],
    select: {
      roomType: true,
      name: true,
      descriptionEn: true,
      pricePerNight: true,
      maxGuests: true,
      extraBed: true,
      amenities: true,
    },
  });

  const byType = new Map<string, RoomCategory>();
  for (const room of rooms) {
    const existing = byType.get(room.roomType);
    if (existing) {
      existing.count += 1;
      // Advertise the lowest price and the widest capacity in the category, so
      // the headline figure is one a guest can actually get.
      existing.pricePerNight = Math.min(existing.pricePerNight, Number(room.pricePerNight));
      existing.maxGuests = Math.max(existing.maxGuests, room.maxGuests);
      existing.extraBed = existing.extraBed || room.extraBed;
      for (const a of room.amenities) {
        if (!existing.amenities.includes(a)) existing.amenities.push(a);
      }
      continue;
    }
    byType.set(room.roomType, {
      slug: room.roomType,
      roomType: room.roomType,
      name: room.name,
      description: room.descriptionEn,
      pricePerNight: Number(room.pricePerNight),
      maxGuests: room.maxGuests,
      extraBed: room.extraBed,
      amenities: [...room.amenities],
      count: 1,
      marketing: marketingFor(room.roomType),
    });
  }

  return [...byType.values()].sort((a, b) => a.pricePerNight - b.pricePerNight);
}

export async function getRoomCategory(slug: string): Promise<RoomCategory | null> {
  const categories = await getRoomCategories();
  return categories.find((c) => c.slug === slug) ?? null;
}
