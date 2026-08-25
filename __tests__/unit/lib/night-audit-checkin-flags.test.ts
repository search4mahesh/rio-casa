/**
 * B-48 — rooms stuck on "Due Check-in" forever.
 *
 * `runNightAudit()` flagged today's arrivals with `occupancy: "due_checkin"`
 * but never wrote `currentBookingId`. Every path that frees a room keys on
 * exactly that column — `releaseRoomsHolding` matches
 * `currentBookingId: { in: … }`, the cancel route matches
 * `currentBookingId: booking.id`, `prisma/repair-data.ts` looks for the same
 * drift — and none of them can match a NULL. So a guest who no-showed,
 * cancelled or moved their dates left the room reading "Due Check-in" for
 * good, and the flags accumulated until the board claimed every room was
 * expecting someone. Observed live: 7 rooms flagged, 6 with no arrival that
 * day, every one with `currentBookingId = NULL`, under a dashboard header
 * reading "1 Arriving today".
 *
 * `/api/admin/night-audit/run` — the manual button — has always written
 * `currentBookingId` here. These tests hold the scheduled path to the same
 * contract, and to re-deriving the flag rather than adding to it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  findMany: vi.fn(),
  updateMany: vi.fn(),
  aggregate: vi.fn(),
  guestUpdate: vi.fn(),
  roomStatusUpdateMany: vi.fn(),
  roomStatusUpsert: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    booking: { findMany: h.findMany, updateMany: h.updateMany, aggregate: h.aggregate },
    guest: { update: h.guestUpdate },
    roomStatus: { updateMany: h.roomStatusUpdateMany, upsert: h.roomStatusUpsert },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  },
}));

vi.mock("@/lib/razorpay", () => ({
  fetchOrderPaymentState: vi.fn().mockResolvedValue("unpaid"),
}));

import { runNightAudit } from "@/lib/booking-service";
import { today } from "@/lib/dates";

const ARRIVAL = { id: "bk_arr", roomId: "room_arrivals", guestId: "guest_1" };
const OCCUPIED_ROOM = "room_occupied";

/**
 * The audit issues several `booking.findMany` calls. Answer each by what it
 * asks for rather than by call order, so adding a query cannot silently
 * repoint these fixtures.
 */
function routeQueries() {
  h.findMany.mockImplementation(async (args: Record<string, any>) => {
    const w = args?.where ?? {};
    if (w.status === "confirmed" && w.actualCheckin === null) return [];      // no-shows
    if (w.checkOut && w.status === "checked_in") return [];                    // due check-outs
    if (w.status === "checked_in" && args.distinct) return [{ roomId: OCCUPIED_ROOM }];
    if (w.checkIn && w.status === "confirmed") return [ARRIVAL];               // today's arrivals
    return [];
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.updateMany.mockResolvedValue({ count: 0 });
  h.aggregate.mockResolvedValue({ _count: { _all: 0 }, _sum: { totalAmount: 0 } });
  h.guestUpdate.mockResolvedValue({});
  h.roomStatusUpdateMany.mockResolvedValue({ count: 0 });
  h.roomStatusUpsert.mockResolvedValue({});
  routeQueries();
});

/** The `roomStatus.updateMany` that clears stale due_checkin flags. */
function staleClear() {
  return h.roomStatusUpdateMany.mock.calls
    .map((c) => c[0])
    .find((a) => a?.where?.occupancy === "due_checkin");
}

describe("runNightAudit — flagging an arrival (B-48)", () => {
  it("writes currentBookingId, so the flag can be cleared again later", async () => {
    await runNightAudit();

    const upsert = h.roomStatusUpsert.mock.calls.map((c) => c[0]).find((a) => a.where.roomId === ARRIVAL.roomId);
    expect(upsert).toBeDefined();

    // This is the whole bug: without it, every clearing path looks past the row.
    expect(upsert!.update).toMatchObject({
      occupancy: "due_checkin",
      currentBookingId: ARRIVAL.id,
      currentGuestId: ARRIVAL.guestId,
    });
    expect(upsert!.create).toMatchObject({
      occupancy: "due_checkin",
      currentBookingId: ARRIVAL.id,
    });
  });

  it("keys the flag to a booking releaseRoomsHolding can actually find", async () => {
    await runNightAudit();

    const upsert = h.roomStatusUpsert.mock.calls.map((c) => c[0]).find((a) => a.where.roomId === ARRIVAL.roomId);
    // `releaseRoomsHolding(bookingIds)` filters on `currentBookingId in [...]`,
    // so the value written here has to be the booking's own id.
    expect(upsert!.update.currentBookingId).toBe(ARRIVAL.id);
    expect(upsert!.update.currentBookingId).not.toBeNull();
  });
});

describe("runNightAudit — stale flags are re-derived, not accumulated", () => {
  it("clears due_checkin on rooms with nobody arriving today", async () => {
    await runNightAudit();

    const clear = staleClear();
    expect(clear).toBeDefined();
    expect(clear!.data).toMatchObject({
      occupancy: "vacant",
      currentBookingId: null,
      currentGuestId: null,
    });
  });

  it("spares the rooms that genuinely are expecting someone today", async () => {
    await runNightAudit();

    const clear = staleClear()!;
    expect(clear.where.roomId.notIn).toContain(ARRIVAL.roomId);
  });

  it("never resets a room with a guest still checked into it", async () => {
    // A stale flag is better than a board that hides someone in the room.
    await runNightAudit();

    const clear = staleClear()!;
    expect(clear.where.roomId.notIn).toContain(OCCUPIED_ROOM);
  });

  it("only ever touches due_checkin — occupied and out_of_order are not its state", async () => {
    await runNightAudit();

    const clear = staleClear()!;
    expect(clear.where.occupancy).toBe("due_checkin");
  });

  it("reports how many it cleared, so a run is auditable", async () => {
    h.roomStatusUpdateMany.mockResolvedValue({ count: 6 });

    const result = await runNightAudit();
    expect(result.staleFlagsCleared).toBe(6);
  });

  it("clears before it flags, so today's arrival is not swept by its own run", async () => {
    await runNightAudit();

    const clearIdx = h.roomStatusUpdateMany.mock.invocationCallOrder.at(-1)!;
    const flagIdx = h.roomStatusUpsert.mock.invocationCallOrder.at(-1)!;
    expect(clearIdx).toBeLessThan(flagIdx);
  });

  it("still flags today's arrivals against the property's day", async () => {
    await runNightAudit();

    const arrivalQuery = h.findMany.mock.calls
      .map((c) => c[0])
      .find((a) => a?.where?.checkIn && a?.where?.status === "confirmed" && !("actualCheckin" in a.where));
    expect(arrivalQuery!.where.checkIn).toEqual(today());
  });
});
