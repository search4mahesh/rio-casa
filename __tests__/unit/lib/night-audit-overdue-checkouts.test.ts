/**
 * B-51 — the departure half of B-04.
 *
 * B-04 was "the cron night audit only ever looked at yesterday, so a skipped
 * run was permanent", and arrivals were changed to an open-ended
 * `checkIn: { lt: today }` so a missed run could be caught up. Departures never
 * were: every query that looked at a `checked_in` booking matched the checkout
 * day exactly. So a checkout the desk never pressed dropped off the list at
 * midnight and was never mentioned again — six stays sat `checked_in` up to 91
 * days past departure, holding their rooms, and with no GST invoice between
 * them, because `generateInvoice` only ever runs from the check-out route.
 *
 * The audit surfaces them; it must not close them. An overdue checkout is a
 * real stay that ended, but the guest may equally still be in the room, and
 * only the front desk knows which.
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
import { today, addDays } from "@/lib/dates";

/** Two departures due today, one 91 days overdue — the shape seen live. */
const DUE_TODAY = [
  { id: "b_due1", roomId: "r1", checkOut: today(), room: {} },
  { id: "b_due2", roomId: "r2", checkOut: today(), room: {} },
];
const LONG_OVERDUE = { id: "b_old", roomId: "r3", checkOut: addDays(today(), -91), room: {} };

function routeQueries() {
  h.findMany.mockImplementation(async (args: Record<string, any>) => {
    const w = args?.where ?? {};
    if (w.status === "confirmed" && w.actualCheckin === null) return [];
    if (w.checkOut && w.status === "checked_in") return [...DUE_TODAY, LONG_OVERDUE];
    if (w.status === "checked_in" && args.distinct) return [];
    if (w.checkIn && w.status === "confirmed") return [];
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

/** The findMany that selects departures. */
function departureQuery() {
  return h.findMany.mock.calls
    .map((c) => c[0])
    .find((a) => a?.where?.checkOut && a?.where?.status === "checked_in" && !a.distinct);
}

describe("runNightAudit — overdue departures (B-51)", () => {
  it("looks backwards, so a missed checkout keeps appearing", async () => {
    await runNightAudit();

    const q = departureQuery();
    expect(q).toBeDefined();
    // The fix. `checkOut: today` matched the day exactly and lost it at midnight.
    expect(q!.where.checkOut).toEqual({ lte: today() });
  });

  it("would still catch a checkout missed 91 days ago", async () => {
    await runNightAudit();

    const bound = departureQuery()!.where.checkOut.lte as Date;
    expect(LONG_OVERDUE.checkOut < bound).toBe(true);
  });

  it("does not reach into tomorrow's departures", async () => {
    await runNightAudit();

    const bound = departureQuery()!.where.checkOut.lte as Date;
    expect(addDays(today(), 1) > bound).toBe(true);
  });

  it("counts the overdue ones separately from today's", async () => {
    // "3 due today" would be a lie: two are due, one is three months late and
    // needs a different response entirely.
    const result = await runNightAudit();

    expect(result.dueCheckouts).toBe(3);
    expect(result.overdueCheckouts).toBe(1);
  });

  it("closes nothing — surfacing is the whole job", async () => {
    await runNightAudit();

    // The only `booking.updateMany` the audit performs is the no-show sweep.
    // Nothing may move a booking to `checked_out`; the guest may still be in
    // the room, and a check-out issues a tax invoice.
    for (const [args] of h.updateMany.mock.calls) {
      expect(args?.data?.status).not.toBe("checked_out");
    }
  });

  it("still flags the rooms as due_checkout so the board says so", async () => {
    await runNightAudit();

    const flagged = h.roomStatusUpsert.mock.calls
      .map((c) => c[0])
      .filter((a) => a.update?.occupancy === "due_checkout")
      .map((a) => a.where.roomId);

    expect(flagged).toEqual(expect.arrayContaining(["r1", "r2", "r3"]));
  });
});
