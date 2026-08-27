/**
 * When a guest's dates come back empty, /rooms offers the next date that works
 * rather than only closing the door. `nextAvailableByType` is what it asks.
 *
 * The scan has to agree with `getAvailableRooms` about what holds a room —
 * cancelled and failed bookings do not, a property-wide block does, and ranges
 * are half-open — or the page offers a date the wizard then refuses.
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

import { nextAvailableByType } from "@/lib/booking-service";
import { dateOnly } from "@/lib/dates";

const ROOMS = [
  { id: "r101", roomType: "standard" },
  { id: "r102", roomType: "standard" },
  { id: "r105", roomType: "family" },
];

// Far enough out that the "not before today" clamp stays out of the way.
const FROM = dateOnly("2099-06-01");
const day = (s: string) => dateOnly(s);

beforeEach(() => {
  vi.clearAllMocks();
  h.roomFindMany.mockResolvedValue(ROOMS);
  h.bookingFindMany.mockResolvedValue([]);
  h.blockedFindMany.mockResolvedValue([]);
});

describe("nextAvailableByType", () => {
  it("offers the requested day itself when the type is free", async () => {
    const next = await nextAvailableByType(2, FROM);
    expect(next.standard).toBe("2099-06-01");
    expect(next.family).toBe("2099-06-01");
  });

  it("skips past a booking to the first day the whole stay fits", async () => {
    // The only family room is taken 1-4 June, so a two-night stay starts on the
    // 4th — the check-out day is free, ranges being half-open.
    h.bookingFindMany.mockResolvedValue([
      { roomId: "r105", checkIn: day("2099-06-01"), checkOut: day("2099-06-04") },
    ]);
    const next = await nextAvailableByType(2, FROM);
    expect(next.family).toBe("2099-06-04");
    expect(next.standard).toBe("2099-06-01");
  });

  it("needs the whole stay free, not just the first night", async () => {
    // Free on the 1st, booked the 2nd: a one-night stay fits, two nights do not.
    h.bookingFindMany.mockResolvedValue([
      { roomId: "r105", checkIn: day("2099-06-02"), checkOut: day("2099-06-03") },
    ]);
    expect((await nextAvailableByType(1, FROM)).family).toBe("2099-06-01");
    expect((await nextAvailableByType(2, FROM)).family).toBe("2099-06-03");
  });

  it("uses any room of the type, not one particular room", async () => {
    // 101 is taken but 102 is not, so standards are free from the first day.
    h.bookingFindMany.mockResolvedValue([
      { roomId: "r101", checkIn: day("2099-06-01"), checkOut: day("2099-06-10") },
    ]);
    expect((await nextAvailableByType(2, FROM)).standard).toBe("2099-06-01");
  });

  it("waits for both rooms of a type to be busy", async () => {
    h.bookingFindMany.mockResolvedValue([
      { roomId: "r101", checkIn: day("2099-06-01"), checkOut: day("2099-06-05") },
      { roomId: "r102", checkIn: day("2099-06-01"), checkOut: day("2099-06-03") },
    ]);
    expect((await nextAvailableByType(1, FROM)).standard).toBe("2099-06-03");
  });

  it("counts a property-wide block against every room", async () => {
    h.blockedFindMany.mockResolvedValue([
      { roomId: null, blockDate: day("2099-06-01") },
      { roomId: null, blockDate: day("2099-06-02") },
    ]);
    const next = await nextAvailableByType(1, FROM);
    expect(next.standard).toBe("2099-06-03");
    expect(next.family).toBe("2099-06-03");
  });

  it("counts a block on one room against that room only", async () => {
    h.blockedFindMany.mockResolvedValue([{ roomId: "r105", blockDate: day("2099-06-01") }]);
    const next = await nextAvailableByType(1, FROM);
    expect(next.family).toBe("2099-06-02");
    expect(next.standard).toBe("2099-06-01");
  });

  it("returns null for a type with nothing free inside the horizon", async () => {
    h.bookingFindMany.mockResolvedValue([
      { roomId: "r105", checkIn: day("2099-06-01"), checkOut: day("2099-12-31") },
    ]);
    expect((await nextAvailableByType(1, FROM, 30)).family).toBeNull();
    expect((await nextAvailableByType(1, FROM, 30)).standard).toBe("2099-06-01");
  });

  it("ignores bookings that do not hold a room", async () => {
    // The query filters these out; this pins that the caller passes the filter
    // rather than scanning every row it is handed.
    const where = () => h.bookingFindMany.mock.calls[0][0].where;
    await nextAvailableByType(1, FROM);
    expect(where().status.notIn).toEqual(["cancelled", "no_show"]);
    expect(where().paymentStatus.notIn).toEqual(["failed"]);
  });

  it("answers nothing when the property has no rooms", async () => {
    h.roomFindMany.mockResolvedValue([]);
    expect(await nextAvailableByType(1, FROM)).toEqual({});
  });
});
