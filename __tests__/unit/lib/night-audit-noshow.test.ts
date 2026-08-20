/**
 * B-04 — the cron night audit and the manual one disagreed about what a
 * no-show is.
 *
 * `runNightAudit()` matched `checkIn: yesterday` exactly; the manual route has
 * always used `checkIn: { lt: today }`. One missed cron run — a deploy window,
 * or the 503 `denyIfNotCron` returns when CRON_SECRET is unset — and that day's
 * missed arrivals stayed `confirmed` forever, because the next run only ever
 * looked at its own yesterday.
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
import { today, addDays, toDayString } from "@/lib/dates";

beforeEach(() => {
  vi.clearAllMocks();
  h.findMany.mockResolvedValue([]);
  h.updateMany.mockResolvedValue({ count: 0 });
  h.aggregate.mockResolvedValue({ _count: { _all: 0 }, _sum: { totalAmount: 0 } });
  h.guestUpdate.mockResolvedValue({});
  h.roomStatusUpdateMany.mockResolvedValue({ count: 0 });
  h.roomStatusUpsert.mockResolvedValue({});
});

/** The findMany call that selects missed arrivals. */
function noShowQuery() {
  return h.findMany.mock.calls
    .map((c) => c[0])
    .find((a) => a?.where?.status === "confirmed" && a?.where?.actualCheckin === null);
}

describe("runNightAudit — no-show selection", () => {
  it("catches every past arrival, not only yesterday's", async () => {
    await runNightAudit();

    const q = noShowQuery();
    expect(q).toBeDefined();
    // The fix: an open-ended past bound, matching the manual route.
    expect(q!.where.checkIn).toEqual({ lt: today() });
  });

  it("would still catch a booking missed three days ago", async () => {
    // What a skipped cron run leaves behind. Under `checkIn: yesterday` this
    // row was unreachable forever.
    const threeDaysAgo = addDays(today(), -3);
    const q = await runNightAudit().then(() => noShowQuery()!);

    const bound = q.where.checkIn.lt as Date;
    expect(threeDaysAgo < bound).toBe(true);
  });

  it("does not sweep up today's arrivals", async () => {
    const q = await runNightAudit().then(() => noShowQuery()!);
    const bound = q.where.checkIn.lt as Date;

    // Half-open: today itself is excluded, so a guest arriving this evening is
    // not marked a no-show at 05:45 this morning.
    expect(toDayString(bound)).toBe(toDayString(today()));
    expect(today() < bound).toBe(false);
  });

  it("only ever touches confirmed bookings that never checked in", async () => {
    const q = await runNightAudit().then(() => noShowQuery()!);

    // What makes re-running safe: anything already no_show/cancelled/checked_in
    // is excluded, so a wider window cannot re-process history.
    expect(q.where.status).toBe("confirmed");
    expect(q.where.actualCheckin).toBeNull();
  });

  it("releases rooms and recomputes totals for what it marked", async () => {
    h.findMany.mockImplementation((args: { where?: { actualCheckin?: unknown } }) =>
      Promise.resolve(
        args?.where?.actualCheckin === null
          ? [{ id: "bk1", guestId: "g1" }, { id: "bk2", guestId: "g1" }]
          : []
      )
    );
    h.updateMany.mockResolvedValue({ count: 2 });

    const result = await runNightAudit();

    expect(result.noShows).toBe(2);
    expect(h.roomStatusUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { currentBookingId: { in: ["bk1", "bk2"] } } })
    );
    // Two bookings, one guest — recomputed once, not twice.
    expect(h.guestUpdate).toHaveBeenCalledTimes(1);
  });
});
