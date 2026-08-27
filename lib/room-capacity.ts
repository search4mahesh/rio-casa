/**
 * How many guests a room sleeps, and which rooms to offer a party that needs
 * more than one.
 *
 * Pure on purpose — no Prisma, no `next/*`. The booking wizard runs this in the
 * browser to show the guest a combination and its price, and the server runs
 * the same code to price and allocate what actually gets booked. Splitting them
 * is how the wizard came to display `pricePerNight × nights` while the server
 * charged `quoteStay` → `applyGst` (B-02); an allocator is a bigger surface for
 * the same mistake, because the guest is agreeing to a *set* of rooms.
 */

/** A room category as the allocator sees it. */
export type AllocatableCategory = {
  roomType: string;
  name: string;
  /** Category minimum, matching what `/rooms` advertises. */
  pricePerNight: number;
  /** Base occupancy — beds already in the room, before any rollaway. */
  maxGuests: number;
  /** True only when *every* free room of the type can take an extra bed. */
  extraBed: boolean;
  /** Per night. Zero when the type takes no extra bed. */
  extraBedRate: number;
  /** How many rooms of this type are free for the requested dates. */
  count: number;
};

/** How many rooms of each type a party is taking. Beds are derived, never picked. */
export type RoomSelection = Record<string, number>;

/** A priced, bed-assigned plan for a party. */
export type Allocation = {
  lines: AllocationLine[];
  /** Heads the plan sleeps, extra beds included. */
  capacity: number;
  /** Rooms only, per night, before markup, discount and tax. */
  roomsNightly: number;
  /** Extra beds only, per night. Broken out because the guest is shown it. */
  bedsNightly: number;
  totalRooms: number;
  totalExtraBeds: number;
  /**
   * Rooms that were asked for and are not in the plan, because the type does
   * not have that many free.
   *
   * A plan is only what the guest asked for when this is 0. `allocate` clamps
   * each line to what exists — it must, there is no other honest answer — but
   * clamping silently is how a party that selected three standard rooms was
   * quoted and booked two with rollaways (B-58). Counted across the whole
   * selection, so a type with *nothing* free is short by its full request
   * rather than vanishing from `lines` unmentioned.
   */
  shortRooms: number;
};

export type AllocationLine = {
  roomType: string;
  name: string;
  /** What the party gets. Never more than the type has free. */
  rooms: number;
  /** What was asked for. Above `rooms` when the type sold out under the guest. */
  requested: number;
  /** Never more than `rooms` — a room takes at most one extra bed. */
  extraBeds: number;
  pricePerNight: number;
  extraBedRate: number;
};

/** Heads one room of this type sleeps, extra bed included. */
export function roomSleeps(cat: Pick<AllocatableCategory, "maxGuests" | "extraBed">): number {
  return cat.maxGuests + (cat.extraBed ? 1 : 0);
}

/**
 * The largest party that fits in a single room anywhere in the property.
 *
 * The wizard uses this to tell a party of six that they need two rooms, rather
 * than showing them the empty state that used to claim the resort was full.
 */
export function largestSingleRoom(cats: AllocatableCategory[]): number {
  return cats.reduce((max, c) => (c.count > 0 ? Math.max(max, roomSleeps(c)) : max), 0);
}

/** Total heads the property can sleep on these dates. */
export function totalCapacity(cats: AllocatableCategory[]): number {
  return cats.reduce((sum, c) => sum + c.count * roomSleeps(c), 0);
}

/**
 * Work out which rooms get an extra bed.
 *
 * Beds are never chosen by the guest — they are added only to cover the heads
 * the base beds do not, and dropped the moment a bigger room covers them. A
 * toggle would let a party of five untick the bed they demonstrably need and
 * arrive to a room nobody set up.
 *
 * Cheapest bed first, then by room type, so the same selection always produces
 * the same plan on the client and on the server.
 */
export function allocate(
  selection: RoomSelection,
  cats: AllocatableCategory[],
  guests: number
): Allocation {
  const chosen = cats
    .filter((c) => (selection[c.roomType] ?? 0) > 0)
    .map((c) => ({
      cat: c,
      requested: selection[c.roomType],
      rooms: Math.min(selection[c.roomType], c.count),
    }));

  // Walked over the *selection*, not over `chosen`: a type with nothing free is
  // filtered out above and would otherwise go unmentioned, which is the same
  // silent substitution one room short.
  const shortRooms = Object.entries(selection).reduce((short, [roomType, wanted]) => {
    if (wanted <= 0) return short;
    const free = cats.find((c) => c.roomType === roomType)?.count ?? 0;
    return short + Math.max(0, wanted - free);
  }, 0);

  const baseCapacity = chosen.reduce((sum, c) => sum + c.rooms * c.cat.maxGuests, 0);
  let shortfall = Math.max(0, guests - baseCapacity);

  // Cheapest bed first; ties broken on room type so the order is total.
  const bedOrder = [...chosen]
    .filter((c) => c.cat.extraBed)
    .sort((a, b) =>
      a.cat.extraBedRate - b.cat.extraBedRate || a.cat.roomType.localeCompare(b.cat.roomType)
    );

  const beds = new Map<string, number>();
  for (const { cat, rooms } of bedOrder) {
    if (shortfall <= 0) break;
    const take = Math.min(rooms, shortfall); // at most one bed per room
    beds.set(cat.roomType, take);
    shortfall -= take;
  }

  const lines: AllocationLine[] = chosen.map(({ cat, rooms, requested }) => ({
    roomType: cat.roomType,
    name: cat.name,
    rooms,
    requested,
    extraBeds: beds.get(cat.roomType) ?? 0,
    pricePerNight: cat.pricePerNight,
    extraBedRate: cat.extraBedRate,
  }));

  return {
    lines,
    capacity: baseCapacity + lines.reduce((s, l) => s + l.extraBeds, 0),
    roomsNightly: lines.reduce((s, l) => s + l.rooms * l.pricePerNight, 0),
    bedsNightly: lines.reduce((s, l) => s + l.extraBeds * l.extraBedRate, 0),
    totalRooms: lines.reduce((s, l) => s + l.rooms, 0),
    totalExtraBeds: lines.reduce((s, l) => s + l.extraBeds, 0),
    shortRooms,
  };
}

/**
 * The cheapest set of rooms that sleeps the party, or null if nothing does.
 *
 * Preselected on the room step so the common case is one press of Continue.
 * The guest can still change it — this is a suggestion, not a constraint.
 *
 * Exhaustive rather than greedy: greedy picks the cheapest room repeatedly and
 * puts a party of four in two standards (₹9,000) when one family room (₹7,500)
 * is both cheaper and one key instead of two. The search space is the number of
 * room types by the count of each — five categories in this property — so
 * enumerating it costs nothing and cannot be wrong.
 */
export function suggestAllocation(
  cats: AllocatableCategory[],
  guests: number
): Allocation | null {
  const usable = cats.filter((c) => c.count > 0);
  if (usable.length === 0 || guests < 1) return null;

  let best: Allocation | null = null;
  const selection: RoomSelection = {};

  const isBetter = (a: Allocation, b: Allocation | null) => {
    if (!b) return true;
    const costA = a.roomsNightly + a.bedsNightly;
    const costB = b.roomsNightly + b.bedsNightly;
    if (costA !== costB) return costA < costB;
    // Same money: fewer keys, then less unsold headroom.
    if (a.totalRooms !== b.totalRooms) return a.totalRooms < b.totalRooms;
    return a.capacity < b.capacity;
  };

  const walk = (i: number, roomsSoFar: number, capacitySoFar: number) => {
    if (capacitySoFar >= guests) {
      const plan = allocate(selection, usable, guests);
      // `allocate` drops beds the base occupancy already covers, so the plan
      // that comes back can be cheaper than the branch that produced it.
      if (plan.capacity >= guests && isBetter(plan, best)) best = plan;
      return;
    }
    if (i >= usable.length) return;
    // A party never needs more rooms than it has heads.
    if (roomsSoFar >= guests) return;

    const cat = usable[i];
    const max = Math.min(cat.count, guests - roomsSoFar);
    for (let n = 0; n <= max; n++) {
      selection[cat.roomType] = n;
      walk(i + 1, roomsSoFar + n, capacitySoFar + n * roomSleeps(cat));
    }
    delete selection[cat.roomType];
  };

  walk(0, 0, 0);
  return best;
}

/** Rooms are all that can be picked; beds follow from the headcount. */
export function selectionFromAllocation(alloc: Allocation): RoomSelection {
  const selection: RoomSelection = {};
  for (const line of alloc.lines) selection[line.roomType] = line.rooms;
  return selection;
}

/**
 * Group free rooms into the categories the guest chooses between.
 *
 * Mirrors `getRoomCategories` in lib/room-catalogue.ts, but over the rooms free
 * for *these dates* rather than the whole property, and carrying the counts the
 * allocator needs. The promises follow the same rule: a category may only offer
 * what every room in it has, because the guest cannot pick which one they get.
 * So price is the minimum, capacity is the minimum, and `extraBed` is an AND
 * across the type — advertising the union is how a forest view on one of four
 * standard rooms was sold to all four (B-55), and doing it with capacity would
 * sell a rollaway three rooms in four cannot take.
 */
export function toCategories(rooms: Array<{
  roomType: string; name: string; pricePerNight: number;
  maxGuests: number; extraBed: boolean; extraBedRate: number | { toString(): string };
}>): AllocatableCategory[] {
  const byType = new Map<string, AllocatableCategory>();
  for (const r of rooms) {
    const rate = Number(r.extraBedRate ?? 0);
    const existing = byType.get(r.roomType);
    if (!existing) {
      byType.set(r.roomType, {
        roomType: r.roomType,
        name: r.name,
        pricePerNight: r.pricePerNight,
        maxGuests: r.maxGuests,
        extraBed: r.extraBed,
        extraBedRate: rate,
        count: 1,
      });
      continue;
    }
    existing.count += 1;
    existing.pricePerNight = Math.min(existing.pricePerNight, r.pricePerNight);
    existing.maxGuests = Math.min(existing.maxGuests, r.maxGuests);
    existing.extraBed = existing.extraBed && r.extraBed;
    // The dearest bed in the type, so the figure shown is never below what the
    // stay is priced at. Price goes the other way — a guest must be able to get
    // the advertised room rate — but a *charge* quoted low is a surprise on the
    // bill.
    existing.extraBedRate = Math.max(existing.extraBedRate, rate);
  }
  return [...byType.values()];
}

/**
 * Parse a `rooms=standard:2,family:1` query param into a selection.
 *
 * Returns null on anything malformed rather than a partial reading. Query
 * params get the same care as bodies: `parseInt` returns NaN, NaN survives
 * every comparison in `allocate`, and a NaN room count reaches Prisma as
 * `take: NaN` and dies as an empty 500 (B-41).
 */
export function parseSelection(raw: string): RoomSelection | null {
  const selection: RoomSelection = {};
  for (const part of raw.split(",")) {
    const match = /^([a-z_]{1,32}):([0-9]{1,2})$/i.exec(part.trim());
    if (!match) return null;
    const count = Number(match[2]);
    if (!Number.isInteger(count) || count < 0) return null;
    // A type named twice would otherwise silently take the last count.
    if (match[1] in selection) return null;
    if (count > 0) selection[match[1]] = count;
  }
  return Object.keys(selection).length > 0 ? selection : null;
}

/** Serialise a selection for the `rooms` query param. Stable order. */
export function formatSelection(selection: RoomSelection): string {
  return Object.entries(selection)
    .filter(([, n]) => n > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([type, n]) => `${type}:${n}`)
    .join(",");
}
