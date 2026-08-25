/**
 * B-42 and B-43 — two places where the same question got two different
 * answers depending on which door you came in through.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRoomFindMany, mockBookingFindMany, mockBlockedFindMany, mockQueryRaw } = vi.hoisted(() => ({
  mockRoomFindMany: vi.fn(),
  mockBookingFindMany: vi.fn(),
  mockBlockedFindMany: vi.fn(),
  mockQueryRaw: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    room: { findMany: mockRoomFindMany },
    booking: { findMany: mockBookingFindMany, findFirst: vi.fn().mockResolvedValue(null) },
    blockedDate: { findMany: mockBlockedFindMany, findFirst: vi.fn().mockResolvedValue(null) },
    $queryRaw: mockQueryRaw,
    $executeRaw: vi.fn(),
  },
}));

import { getAvailableRooms, previewPromo } from "@/lib/booking-service";
import { today, addDays, dateOnly } from "@/lib/dates";

beforeEach(() => {
  vi.clearAllMocks();
  mockRoomFindMany.mockResolvedValue([{ id: "r1", roomType: "standard", maxGuests: 2 }]);
  mockBookingFindMany.mockResolvedValue([]);
  mockBlockedFindMany.mockResolvedValue([]);
});

/**
 * B-42. `checkAvailability` refuses a stay in the past and so does
 * `createBooking`, but `getAvailableRooms` — the one behind the room list —
 * had no such guard. /rooms therefore advertised rooms as available for dates
 * that could not be booked, and the single-room check on the same dates said
 * the opposite.
 */
describe("getAvailableRooms — past and inverted ranges (B-42)", () => {
  it("offers nothing for a stay that has already been and gone", async () => {
    const rooms = await getAvailableRooms(dateOnly("2020-01-01"), dateOnly("2020-01-03"));

    expect(rooms).toEqual([]);
    // It must not even ask the database — the answer is knowable up front, and
    // the point is that it agrees with checkAvailability without a round trip.
    expect(mockRoomFindMany).not.toHaveBeenCalled();
  });

  it("offers nothing when check-out is not after check-in", async () => {
    const day = addDays(today(), 5);
    expect(await getAvailableRooms(day, day)).toEqual([]);
    expect(await getAvailableRooms(addDays(day, 1), day)).toEqual([]);
  });

  it("still answers normally for a future stay", async () => {
    const from = addDays(today(), 10);
    const rooms = await getAvailableRooms(from, addDays(from, 2));

    expect(rooms).toHaveLength(1);
    expect(mockRoomFindMany).toHaveBeenCalled();
  });
});

/**
 * B-43. The preview route trimmed the code before matching; `claimPromo` did
 * not. A pasted or autocompleted " SUMMER20 " previewed as a valid discount
 * and then failed to claim at checkout, which fails the *whole* booking with
 * "that promo code is no longer valid" — against a code the guest had just
 * been shown working.
 */
describe("promo code matching is whitespace-insensitive on both paths (B-43)", () => {
  const PROMO = {
    discount_type: "percentage",
    discount_value: "10",
    max_discount: null,
    valid_from: dateOnly("2026-01-01"),
    valid_to: dateOnly("2026-12-31"),
    min_nights: 1,
    min_amount: "0",
    usage_limit: null,
    used_count: 0,
    is_active: true,
  };

  it("previewPromo matches a code with surrounding whitespace", async () => {
    mockQueryRaw.mockResolvedValue([PROMO]);

    const r = await previewPromo("  SUMMER20  ", dateOnly("2026-06-01"), 2, 10000);

    expect(r.valid).toBe(true);
    expect(r.discount).toBe(1000);
  });

  it("binds the trimmed code as the SQL parameter, so both paths look up the same string", async () => {
    mockQueryRaw.mockResolvedValue([PROMO]);
    await previewPromo("  SUMMER20  ", dateOnly("2026-06-01"), 2, 10000);

    // The tagged-template values are the bound parameters; the untrimmed form
    // is what used to reach `claimPromo` and match nothing.
    const boundValues = mockQueryRaw.mock.calls[0].slice(1);
    expect(boundValues).toContain("SUMMER20");
    expect(boundValues).not.toContain("  SUMMER20  ");
  });
});
