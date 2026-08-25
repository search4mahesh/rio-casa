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
  /**
   * Amenities **every** room of this type has, so a card can promise them
   * without knowing which door the guest ends up behind.
   */
  amenities: string[];
  /**
   * Amenities only some rooms of this type have. Never mixed into `amenities`
   * — see the note on `getRoomCategories`.
   */
  someRoomsAmenities: string[];
  /** How many physical rooms of this type are active. */
  count: number;
  marketing: RoomMarketing;
};

/**
 * Split a type's amenity lists into what every room has and what only some do.
 *
 * The union used to be advertised as if it were the category's. "Forest View"
 * is on one of four standard rooms, so `/rooms` promised a view that three
 * guests in four would not get — and the guest never picks a door number, the
 * wizard allocates one (B-55). Price was already merged the honest way, taking
 * the category minimum "so the headline figure is one a guest can actually
 * get"; this makes amenities follow the same rule.
 *
 * The odd ones out are kept rather than dropped — the property really does
 * have a forest-view room — but they are returned separately so a card cannot
 * imply they come as standard.
 */
function splitAmenities(lists: string[][]): { amenities: string[]; someRoomsAmenities: string[] } {
  const order: string[] = [];
  for (const list of lists) for (const a of list) if (!order.includes(a)) order.push(a);

  const amenities = order.filter((a) => lists.every((l) => l.includes(a)));
  const someRoomsAmenities = order.filter((a) => !lists.every((l) => l.includes(a)));
  return { amenities, someRoomsAmenities };
}

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

  // Amenities are collected per type first, because "does every room have
  // this?" cannot be answered until the last room of the type has been seen.
  const amenityLists = new Map<string, string[][]>();
  for (const room of rooms) {
    const lists = amenityLists.get(room.roomType) ?? [];
    lists.push(room.amenities);
    amenityLists.set(room.roomType, lists);
  }

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
      ...splitAmenities(amenityLists.get(room.roomType) ?? [room.amenities]),
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
