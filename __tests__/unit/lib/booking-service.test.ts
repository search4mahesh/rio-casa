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

import { checkAvailability, getAvailableRooms } from "@/lib/booking-service";
import { prisma } from "@/lib/prisma";

const mockPrisma = prisma as unknown as {
  blockedDate: { findFirst: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
  booking: { findFirst: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
  room: { findMany: ReturnType<typeof vi.fn> };
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

  it("filters by minGuests capacity", async () => {
    // room.findMany is called with maxGuests >= minGuests — but our mock returns all three
    // Check that the DB query was called with the right filter
    await getAvailableRooms(tomorrow, nextWeek, 4);
    expect(mockPrisma.room.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ maxGuests: { gte: 4 } }) })
    );
  });
});
