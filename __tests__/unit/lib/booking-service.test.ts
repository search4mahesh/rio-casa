import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Prisma before importing the module under test
vi.mock("@/lib/prisma", () => ({
  prisma: {
    blockedDate: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    booking: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
    },
    room: {
      findMany: vi.fn().mockResolvedValue([]),
      findUniqueOrThrow: vi.fn(),
    },
    guest: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    ratePlan: { findFirst: vi.fn().mockResolvedValue(null) },
    promotion: { findFirst: vi.fn().mockResolvedValue(null) },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

import { applyGst, checkAvailability, getAvailableRooms, quoteStay } from "@/lib/booking-service";
import { prisma } from "@/lib/prisma";

const mockPrisma = prisma as unknown as {
  blockedDate: { findFirst: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
  booking: { findFirst: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
  room: { findMany: ReturnType<typeof vi.fn> };
  ratePlan: { findFirst: ReturnType<typeof vi.fn> };
};

const today = new Date();
today.setHours(0, 0, 0, 0);

const tomorrow = new Date(today);
tomorrow.setDate(tomorrow.getDate() + 1);

const dayAfter = new Date(today);
dayAfter.setDate(dayAfter.getDate() + 2);

const nextWeek = new Date(today);
nextWeek.setDate(nextWeek.getDate() + 7);

describe("checkAvailability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.blockedDate.findFirst.mockResolvedValue(null);
    mockPrisma.booking.findFirst.mockResolvedValue(null);
  });

  it("returns available when no conflicts exist", async () => {
    const result = await checkAvailability("room_1", tomorrow, dayAfter);
    expect(result.available).toBe(true);
  });

  it("returns unavailable when checkIn equals checkOut", async () => {
    const result = await checkAvailability("room_1", tomorrow, tomorrow);
    expect(result.available).toBe(false);
  });

  it("returns unavailable when checkIn is after checkOut", async () => {
    const result = await checkAvailability("room_1", dayAfter, tomorrow);
    expect(result.available).toBe(false);
  });

  it("returns unavailable when checkIn is in the past", async () => {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const result = await checkAvailability("room_1", yesterday, tomorrow);
    expect(result.available).toBe(false);
  });

  it("returns unavailable with bookingNumber when a conflicting booking exists", async () => {
    mockPrisma.booking.findFirst.mockResolvedValue({ bookingNumber: "BK-20260528-001" });
    const result = await checkAvailability("room_1", tomorrow, nextWeek);
    expect(result.available).toBe(false);
    expect(result.conflictingBooking).toBe("BK-20260528-001");
  });

  it("returns unavailable when a blocked date falls in range", async () => {
    mockPrisma.blockedDate.findFirst.mockResolvedValue({ id: "block_1" });
    const result = await checkAvailability("room_1", tomorrow, nextWeek);
    expect(result.available).toBe(false);
  });
});

describe("quoteStay", () => {
  // 9 Oct 2026 is a Friday, so 9→11 Oct is a Fri + Sat stay and 12→13 Oct
  // (Monday) is a weekday one.
  const FRI = new Date("2026-10-09T00:00:00.000Z");
  const SUN = new Date("2026-10-11T00:00:00.000Z");
  const MON = new Date("2026-10-12T00:00:00.000Z");
  const TUE = new Date("2026-10-13T00:00:00.000Z");

  const room = { roomType: "deluxe", pricePerNight: 5500 };
  const plan = {
    id: "rp1", baseRate: 6000, extraBedRate: 800, weekendMarkup: 20,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.ratePlan.findFirst.mockResolvedValue(null);
  });

  it("falls back to the room's displayed price when no rate plan applies", async () => {
    const q = await quoteStay({ room, checkIn: MON, checkOut: TUE });
    expect(q.nightlyRate).toBe(5500);
    expect(q.subtotal).toBe(5500);
    expect(q.ratePlanId).toBeNull();
  });

  it("prices from the rate plan when one applies", async () => {
    mockPrisma.ratePlan.findFirst.mockResolvedValue(plan);
    const q = await quoteStay({ room, checkIn: MON, checkOut: TUE });
    expect(q.nightlyRate).toBe(6000);
    expect(q.subtotal).toBe(6000);
    expect(q.ratePlanId).toBe("rp1");
  });

  it("applies the weekend markup to Friday and Saturday nights", async () => {
    mockPrisma.ratePlan.findFirst.mockResolvedValue(plan);
    const q = await quoteStay({ room, checkIn: FRI, checkOut: SUN });
    expect(q.nights).toBe(2);
    expect(q.subtotal).toBe(6000 * 1.2 * 2);
  });

  it("charges the extra bed only when a rate plan defines one", async () => {
    const without = await quoteStay({ room, checkIn: MON, checkOut: TUE, extraBed: true });
    expect(without.extraBedRate).toBe(0);

    mockPrisma.ratePlan.findFirst.mockResolvedValue(plan);
    const withPlan = await quoteStay({ room, checkIn: MON, checkOut: TUE, extraBed: true });
    expect(withPlan.extraBedRate).toBe(800);
    expect(withPlan.subtotal).toBe(6800);
  });

  it("uses a negotiated rate flat, ignoring the rate plan and the weekend", async () => {
    mockPrisma.ratePlan.findFirst.mockResolvedValue(plan);
    const q = await quoteStay({ room, checkIn: FRI, checkOut: SUN, extraBed: true, rateOverride: 4000 });
    expect(q.overridden).toBe(true);
    expect(q.subtotal).toBe(8000); // 4000 × 2, no markup, no extra bed
    expect(mockPrisma.ratePlan.findFirst).not.toHaveBeenCalled();
  });

  it("prices the website and the front desk identically for the same stay", async () => {
    // The bug this guards: the walk-in route used to price off room.baseRate
    // with no rate plan, no weekend markup and no extra bed, so the first rate
    // plan anyone created made walk-ins quietly cheaper than the same room
    // booked online. Both paths now call this one function.
    mockPrisma.ratePlan.findFirst.mockResolvedValue(plan);
    const web = await quoteStay({ room, checkIn: FRI, checkOut: SUN, extraBed: true });
    mockPrisma.ratePlan.findFirst.mockResolvedValue(plan);
    const desk = await quoteStay({ room, checkIn: FRI, checkOut: SUN, extraBed: true });
    expect(desk.subtotal).toBe(web.subtotal);
  });

  it("looks up a plan by this room's type or by 'all' (B-30)", async () => {
    // RATE_PLAN_ROOM_TYPES in lib/labels.ts deliberately includes "all" — the
    // admin form's "All Rooms" option saves exactly that string. Matching only
    // room.roomType meant such a plan could save without error and then never
    // be found by the one place that prices a stay.
    await quoteStay({ room, checkIn: MON, checkOut: TUE });
    const where = mockPrisma.ratePlan.findFirst.mock.calls[0][0].where;
    expect(where.roomType).toEqual({ in: ["deluxe", "all"] });
  });
});

describe("applyGst", () => {
  it("charges 12% at or below ₹7,500 a night", () => {
    const t = applyGst(7500, 0, 1);
    expect(t.cgstAmount).toBe(450);
    expect(t.sgstAmount).toBe(450);
    expect(t.totalAmount).toBe(8400);
  });

  it("charges 18% above ₹7,500 a night", () => {
    const t = applyGst(8000, 0, 1);
    expect(t.cgstAmount).toBe(720);
    expect(t.totalAmount).toBe(9440);
  });

  it("applies the slab to the discounted amount, not the gross", () => {
    // ₹8,000 gross is an 18% room, but ₹1,000 off drops it to the 12% slab.
    const t = applyGst(8000, 1000, 1);
    expect(t.taxableAmount).toBe(7000);
    expect(t.cgstAmount).toBe(420);
  });
});

describe("getAvailableRooms", () => {
  const mockRooms = [
    { id: "r1", roomType: "Deluxe",  maxGuests: 2, isActive: true },
    { id: "r2", roomType: "Premium", maxGuests: 2, isActive: true },
    { id: "r3", roomType: "Family",  maxGuests: 4, isActive: true },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.blockedDate.findFirst.mockResolvedValue(null);
    mockPrisma.blockedDate.findMany.mockResolvedValue([]);
    mockPrisma.room.findMany.mockResolvedValue(mockRooms);
    mockPrisma.booking.findMany.mockResolvedValue([]);
  });

  it("returns all active rooms when none are booked", async () => {
    const rooms = await getAvailableRooms(tomorrow, nextWeek, 1);
    expect(rooms).toHaveLength(3);
  });

  it("excludes rooms that have a conflicting booking", async () => {
    mockPrisma.booking.findMany.mockResolvedValue([{ roomId: "r1" }]);
    const rooms = await getAvailableRooms(tomorrow, nextWeek, 1);
    expect(rooms.map((r) => r.id)).not.toContain("r1");
    expect(rooms).toHaveLength(2);
  });

  it("filters by minGuests capacity, counting the extra bed", async () => {
    // A room sleeps `maxGuests`, or one more if it takes a rollaway. Filtering
    // on `maxGuests` alone told a party of 5 the property was full while five
    // rooms sat empty (B-57), so the predicate is an OR over both.
    await getAvailableRooms(tomorrow, nextWeek, 4);
    expect(mockPrisma.room.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { maxGuests: { gte: 4 } },
            { extraBed: true, maxGuests: { gte: 3 } },
          ],
        }),
      })
    );
  });
});
