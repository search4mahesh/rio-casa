/**
 * B-08 / B-10 — calendar-day bounds, and one block per room per day.
 *
 * `checkIn`, `block_date`, `Expense.date` and `sentDate` are Postgres DATE
 * columns. A bound built with `new Date(y, m, d)` is *local* midnight, which on
 * an IST machine is 18:30 UTC the previous day — Postgres casts it straight
 * back to that day. Four admin routes still built bounds that way.
 *
 * These assert in UTC deliberately. The versions that shipped asserted with
 * local-time `new Date(...)` constructors on both sides, so they agreed with
 * the bug and could never have caught it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  expenseFindMany: vi.fn(),
  laundryFindMany: vi.fn(),
  bookingFindMany: vi.fn(),
  blockedCreateMany: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  requireRole: vi.fn().mockResolvedValue({
    ok: true,
    staff: { staffId: "s1", role: "manager", name: "M", email: "m@r.in" },
  }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    expense: { findMany: h.expenseFindMany },
    laundryBatch: { findMany: h.laundryFindMany },
    booking: { findMany: h.bookingFindMany },
    blockedDate: { createMany: h.blockedCreateMany, findMany: vi.fn() },
    // Blocking writes an audit row — this file only cares about the date
    // bounds, but the route awaits the write, so it has to exist.
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  },
}));

import { GET as expensesGet } from "@/app/api/admin/expenses/route";
import { GET as laundryGet } from "@/app/api/admin/laundry/route";
import { POST as blockedPost } from "@/app/api/admin/blocked-dates/route";

function get(path: string, params: Record<string, string>) {
  const url = new URL(`http://localhost${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url.toString());
}

beforeEach(() => {
  vi.clearAllMocks();
  h.expenseFindMany.mockResolvedValue([]);
  h.laundryFindMany.mockResolvedValue([]);
  h.bookingFindMany.mockResolvedValue([]);
  h.blockedCreateMany.mockResolvedValue({ count: 0 });
});

describe("month filters use UTC-midnight bounds (B-08)", () => {
  it("expenses: August means 1 Aug 00:00Z up to 1 Sep 00:00Z", async () => {
    await expensesGet(get("/api/admin/expenses", { month: "2026-08" }));

    const where = h.expenseFindMany.mock.calls[0][0].where;
    expect((where.date.gte as Date).toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect((where.date.lt as Date).toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("expenses: the old bounds would have leaked 31 July in", async () => {
    await expensesGet(get("/api/admin/expenses", { month: "2026-08" }));

    const gte = h.expenseFindMany.mock.calls[0][0].where.date.gte as Date;
    // `new Date(2026, 7, 1)` on an IST box is 2026-07-31T18:30:00Z, which
    // Postgres truncates to 31 July — the August view showed a July expense.
    expect(gte.getTime()).not.toBe(new Date(2026, 7, 1).getTime());
    expect(gte.toISOString().slice(0, 10)).toBe("2026-08-01");
  });

  it("expenses: rejects a malformed month rather than querying NaN", async () => {
    const res = await expensesGet(get("/api/admin/expenses", { month: "August" }));
    expect(res.status).toBe(400);
    expect(h.expenseFindMany).not.toHaveBeenCalled();
  });

  it("laundry: sentDate window is UTC midnight to UTC midnight", async () => {
    await laundryGet(get("/api/admin/laundry", { month: "2026-02" }));

    const where = h.laundryFindMany.mock.calls[0][0].where;
    expect((where.sentDate.gte as Date).toISOString()).toBe("2026-02-01T00:00:00.000Z");
    // February 2026 has 28 days — the bound is derived, not hardcoded.
    expect((where.sentDate.lt as Date).toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });

  it("laundry: rejects a malformed month", async () => {
    const res = await laundryGet(get("/api/admin/laundry", { month: "2026-2" }));
    expect(res.status).toBe(400);
  });
});

describe("blocking a range is idempotent (B-10)", () => {
  function post(body: Record<string, unknown>) {
    return new NextRequest("http://localhost/api/admin/blocked-dates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("asks the database to skip days already blocked", async () => {
    await blockedPost(post({ roomId: "r1", startDate: "2026-12-20", endDate: "2026-12-21" }));

    const call = h.blockedCreateMany.mock.calls[0][0];
    // Without this, a double-clicked Block leaves two rows per day; unblocking
    // deletes the visible one and the room stays blocked by its twin.
    expect(call.skipDuplicates).toBe(true);
  });

  it("stores calendar days, inclusive of both ends", async () => {
    await blockedPost(post({ roomId: "r1", startDate: "2026-12-20", endDate: "2026-12-21" }));

    const rows = h.blockedCreateMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(2);
    expect((rows[0].blockDate as Date).toISOString()).toBe("2026-12-20T00:00:00.000Z");
    expect((rows[1].blockDate as Date).toISOString()).toBe("2026-12-21T00:00:00.000Z");
  });

  it("reports how many were actually added, not how many were asked for", async () => {
    // Re-blocking a range that overlaps an existing block.
    h.blockedCreateMany.mockResolvedValue({ count: 1 });

    const res = await blockedPost(
      post({ roomId: "r1", startDate: "2026-12-20", endDate: "2026-12-21" })
    );
    const { data } = await res.json();
    expect(data).toBe(1);
  });
});
