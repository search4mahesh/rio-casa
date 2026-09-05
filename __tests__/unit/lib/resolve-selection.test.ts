/**
 * The guest picks room *types* and counts; `resolveSelection` turns that into
 * door numbers. What it must never do is fill a request with fewer rooms than
 * were asked for.
 *
 * `allocate` clamps each line to the rooms that exist — it has to, there is no
 * other honest allocation — so a request for three standards when two are free
 * comes back as a perfectly valid plan for two, with rollaways covering the
 * heads so even a capacity check passes. The guest booked three keys and
 * arrives to two (B-58).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  roomFindMany: vi.fn(),
  bookingFindMany: vi.fn(),
  blockedFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    room: { findMany: h.roomFindMany },
    booking: { findMany: h.bookingFindMany },
    blockedDate: { findMany: h.blockedFindMany },
  },
}));

vi.mock("@/lib/razorpay", () => ({ fetchOrderPaymentState: vi.fn() }));

import { resolveSelection } from "@/lib/booking-service";

const room = (id: string, roomType: string, name: string, pricePerNight: number, maxGuests = 2) => ({
  id,
  name,
  slug: `${roomType}-${id}`,
  roomType,
  pricePerNight,
  maxGuests,
  extraBed: true,
  extraBedRate: 1000,
  amenities: [],
  images: [],
  roomNumber: id,
  isActive: true,
});

/** Two standards and one luxury free — the live shape this was found against. */
const FREE = [
  room("r101", "standard", "Standard Room", 4500),
  room("r102", "standard", "Standard Room", 4500),
  room("r201", "luxury", "Luxury Room", 6500),
];

// Far enough out that the past-date guard in `getAvailableRooms` stays out of it.
const CHECK_IN = new Date("2099-09-01T00:00:00.000Z");
const CHECK_OUT = new Date("2099-09-03T00:00:00.000Z");

const resolve = (selection: Record<string, number>, guests: number) =>
  resolveSelection(CHECK_IN, CHECK_OUT, selection, guests);

beforeEach(() => {
  vi.clearAllMocks();
  h.roomFindMany.mockResolvedValue(FREE);
  h.bookingFindMany.mockResolvedValue([]);
  h.blockedFindMany.mockResolvedValue([]);
});

describe("resolveSelection", () => {
  it("resolves a request the property can fill", () => {
    return resolve({ standard: 2 }, 4).then((res) => {
      expect(res).not.toBeNull();
      expect(res!.rooms.map((r) => r.roomId)).toEqual(["r101", "r102"]);
      expect(res!.allocation.shortRooms).toBe(0);
    });
  });

  it("refuses a request for more rooms of a type than are free", async () => {
    // Two standards free, three asked for. Before B-58 this booked two rooms
    // with two rollaways and told the guest nothing.
    expect(await resolve({ standard: 3 }, 6)).toBeNull();
  });

  it("refuses when a second type has sold out entirely", async () => {
    // `deluxe` is dropped from `lines` rather than clamped, so a caller looking
    // at what came back sees a tidy one-room plan. Two couples wanting separate
    // rooms would have been booked into one.
    expect(await resolve({ standard: 1, deluxe: 1 }, 4)).toBeNull();
    expect(await resolve({ standard: 1, deluxe: 1 }, 2)).toBeNull();
  });

  it("refuses a type with nothing free", async () => {
    expect(await resolve({ deluxe: 1 }, 2)).toBeNull();
  });

  it("refuses once a room is taken that was free a moment ago", async () => {
    // The reachable path: availability is fetched on "Continue to Room
    // Selection", so a guest can select three standards while three are free
    // and continue after someone takes one.
    h.roomFindMany.mockResolvedValue([...FREE, room("r103", "standard", "Standard Room", 4500)]);
    expect(await resolve({ standard: 3 }, 6)).not.toBeNull();

    h.bookingFindMany.mockResolvedValue([
      { roomId: "r103", checkIn: CHECK_IN, checkOut: CHECK_OUT },
    ]);
    expect(await resolve({ standard: 3 }, 6)).toBeNull();
  });

  it("gives a category its cheapest rooms, in listing order", async () => {
    const res = await resolve({ standard: 1, luxury: 1 }, 4);
    expect(res!.rooms.map((r) => r.roomId)).toEqual(["r101", "r201"]);
  });

  it("assigns extra beds from the headcount, not from the client", async () => {
    const res = await resolve({ standard: 2 }, 6);
    expect(res!.rooms).toEqual([
      { roomId: "r101", extraBed: true },
      { roomId: "r102", extraBed: true },
    ]);
  });

  it("returns null when nothing at all is free", async () => {
    h.roomFindMany.mockResolvedValue([]);
    expect(await resolve({ standard: 1 }, 2)).toBeNull();
  });
});
