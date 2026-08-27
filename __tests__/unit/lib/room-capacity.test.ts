import { describe, it, expect } from "vitest";
import {
  roomSleeps,
  largestSingleRoom,
  totalCapacity,
  allocate,
  suggestAllocation,
  type AllocatableCategory,
} from "@/lib/room-capacity";

/** The property as seeded: 2 standard, 1 deluxe, 1 luxury, 1 family. */
const CATS: AllocatableCategory[] = [
  { roomType: "standard", name: "Standard Room", pricePerNight: 4500, maxGuests: 2, extraBed: true, extraBedRate: 1000, count: 2 },
  { roomType: "deluxe",   name: "Deluxe Room",   pricePerNight: 5500, maxGuests: 2, extraBed: true, extraBedRate: 1000, count: 1 },
  { roomType: "luxury",   name: "Luxury Room",   pricePerNight: 6500, maxGuests: 2, extraBed: true, extraBedRate: 1000, count: 1 },
  { roomType: "family",   name: "Family Room",   pricePerNight: 7500, maxGuests: 4, extraBed: true, extraBedRate: 1000, count: 1 },
];

describe("roomSleeps", () => {
  it("counts the extra bed", () => {
    expect(roomSleeps({ maxGuests: 4, extraBed: true })).toBe(5);
    expect(roomSleeps({ maxGuests: 2, extraBed: true })).toBe(3);
  });

  it("does not invent a bed a room does not have", () => {
    expect(roomSleeps({ maxGuests: 4, extraBed: false })).toBe(4);
  });
});

describe("largestSingleRoom", () => {
  it("is the family room plus its extra bed", () => {
    expect(largestSingleRoom(CATS)).toBe(5);
  });

  it("ignores types with nothing free", () => {
    const soldOutFamily = CATS.map((c) => (c.roomType === "family" ? { ...c, count: 0 } : c));
    expect(largestSingleRoom(soldOutFamily)).toBe(3);
  });

  it("is 0 when the property is full", () => {
    expect(largestSingleRoom(CATS.map((c) => ({ ...c, count: 0 })))).toBe(0);
  });
});

describe("totalCapacity", () => {
  it("counts every free room and its bed", () => {
    // (2+1)*2 + 3 + 3 + (4+1) = 17
    expect(totalCapacity(CATS)).toBe(17);
  });
});

describe("allocate", () => {
  it("adds a bed only for the heads the room does not sleep", () => {
    // 5 guests in the family room (sleeps 4) — one bed covers the fifth.
    const plan = allocate({ family: 1 }, CATS, 5);
    expect(plan.capacity).toBe(5);
    expect(plan.totalExtraBeds).toBe(1);
    expect(plan.roomsNightly).toBe(7500);
    expect(plan.bedsNightly).toBe(1000);
  });

  it("charges no bed when the base occupancy already covers the party", () => {
    const plan = allocate({ family: 1 }, CATS, 4);
    expect(plan.totalExtraBeds).toBe(0);
    expect(plan.bedsNightly).toBe(0);
  });

  it("never puts two beds in one room", () => {
    // 2 guests over base in a single room — the second head cannot be slept.
    const plan = allocate({ standard: 1 }, CATS, 4);
    expect(plan.totalExtraBeds).toBe(1);
    expect(plan.capacity).toBe(3); // short of 4, so the wizard must not accept it
  });

  it("spreads beds across rooms, one each", () => {
    // 2 standards sleep 4; a party of 6 needs a bed in both.
    const plan = allocate({ standard: 2 }, CATS, 6);
    expect(plan.totalExtraBeds).toBe(2);
    expect(plan.capacity).toBe(6);
    expect(plan.bedsNightly).toBe(2000);
  });

  it("honours the user's request across two types", () => {
    // The shape the resort asked for: one room with a bed, one without.
    const plan = allocate({ standard: 1, family: 1 }, CATS, 5);
    expect(plan.capacity).toBeGreaterThanOrEqual(5);
    expect(plan.totalRooms).toBe(2);
    expect(plan.totalExtraBeds).toBe(0); // 2 + 4 = 6 base beds, no rollaway needed
  });

  it("cannot select more rooms than are free", () => {
    const plan = allocate({ family: 9 }, CATS, 20);
    expect(plan.lines[0].rooms).toBe(1);
  });

  it("says how many rooms it could not fill", () => {
    // Clamping is the only honest allocation — but a caller that cannot see the
    // clamp books two rooms for a guest who asked for three (B-58).
    const plan = allocate({ standard: 3 }, CATS, 6);
    expect(plan.lines[0].rooms).toBe(2);
    expect(plan.lines[0].requested).toBe(3);
    expect(plan.shortRooms).toBe(1);
    // The trap: rollaways make the plan sleep the party anyway, so a capacity
    // check passes and the substitution looks like a valid answer.
    expect(plan.capacity).toBeGreaterThanOrEqual(6);
  });

  it("counts a type with nothing free as short, not as absent", () => {
    // `deluxe` is filtered out of `lines` entirely, so a caller looking only at
    // what came back sees a tidy one-room plan and never learns the second room
    // was dropped.
    const soldOut = CATS.filter((c) => c.roomType !== "deluxe");
    const plan = allocate({ standard: 1, deluxe: 1 }, soldOut, 4);
    expect(plan.lines).toHaveLength(1);
    expect(plan.totalRooms).toBe(1);
    expect(plan.shortRooms).toBe(1);
  });

  it("is short by nothing when the request fits", () => {
    const plan = allocate({ standard: 2, family: 1 }, CATS, 8);
    expect(plan.shortRooms).toBe(0);
    expect(plan.lines.every((l) => l.rooms === l.requested)).toBe(true);
  });
});

describe("suggestAllocation", () => {
  it("puts a party of 5 in the family room with one extra bed", () => {
    const plan = suggestAllocation(CATS, 5)!;
    expect(plan.totalRooms).toBe(1);
    expect(plan.lines[0].roomType).toBe("family");
    expect(plan.totalExtraBeds).toBe(1);
    expect(plan.roomsNightly + plan.bedsNightly).toBe(8500);
  });

  it("prefers one family room to two standards for a party of 4", () => {
    // The greedy answer is 2 standards at ₹9,000; the family room is ₹7,500
    // and one key rather than two.
    const plan = suggestAllocation(CATS, 4)!;
    expect(plan.totalRooms).toBe(1);
    expect(plan.lines[0].roomType).toBe("family");
    expect(plan.roomsNightly).toBe(7500);
  });

  it("uses two rooms when no single room sleeps the party", () => {
    const plan = suggestAllocation(CATS, 6)!;
    expect(plan.capacity).toBeGreaterThanOrEqual(6);
    expect(plan.totalRooms).toBeGreaterThanOrEqual(2);
  });

  it("takes the cheapest combination, not the first that fits", () => {
    const plan = suggestAllocation(CATS, 7)!;
    const cost = plan.roomsNightly + plan.bedsNightly;
    // family(4) + standard(2) + 1 bed = 7500 + 4500 + 1000 = 13,000
    expect(cost).toBe(13000);
    expect(plan.capacity).toBeGreaterThanOrEqual(7);
  });

  it("fills the property for a party of 17", () => {
    const plan = suggestAllocation(CATS, 17)!;
    expect(plan.capacity).toBe(17);
    expect(plan.totalRooms).toBe(5);
    expect(plan.totalExtraBeds).toBe(5);
  });

  it("returns null when the party exceeds the whole property", () => {
    expect(suggestAllocation(CATS, 18)).toBeNull();
  });

  it("returns null when nothing is free", () => {
    expect(suggestAllocation(CATS.map((c) => ({ ...c, count: 0 })), 2)).toBeNull();
  });

  it("does not charge a bed a party of 2 does not need", () => {
    const plan = suggestAllocation(CATS, 2)!;
    expect(plan.totalExtraBeds).toBe(0);
    expect(plan.roomsNightly).toBe(4500);
  });

  it("uses a bed rather than a second room when that is cheaper", () => {
    // 3 guests: standard + bed = ₹5,500 beats two standards at ₹9,000.
    const plan = suggestAllocation(CATS, 3)!;
    expect(plan.totalRooms).toBe(1);
    expect(plan.totalExtraBeds).toBe(1);
    expect(plan.roomsNightly + plan.bedsNightly).toBe(5500);
  });

  it("never suggests a plan it cannot fill", () => {
    // It builds selections out of the counts it was handed, so a suggestion is
    // short only if the search has gone wrong — and a caller refusing on
    // `shortRooms` would then reject its own suggestion (B-58).
    for (let guests = 1; guests <= 17; guests++) {
      expect(suggestAllocation(CATS, guests)!.shortRooms).toBe(0);
    }
  });
});
