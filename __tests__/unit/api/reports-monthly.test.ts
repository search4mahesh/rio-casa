/**
 * B-09 — the monthly occupancy series was not clamped to the report window.
 *
 * The headline `occupiedNights` clipped each stay to [from, toExclusive); the
 * per-month walk counted every night of the stay. A report for 15–20 Sep
 * against a booking spanning all of September put 5 nights in the KPI and 30 in
 * the September bar — two numbers on one screen, both labelled occupancy.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  roomCount: vi.fn(),
  bookingFindMany: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  requireRole: vi.fn().mockResolvedValue({
    ok: true,
    staff: { staffId: "s1", role: "manager", name: "M", email: "m@r.in" },
  }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    room: { count: h.roomCount },
    booking: { findMany: h.bookingFindMany },
  },
}));

import { GET } from "@/app/api/admin/reports/route";

function req(params: Record<string, string>) {
  const url = new URL("http://localhost/api/admin/reports");
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url.toString());
}

/** One booking covering the whole of September 2026. */
const wholeOfSeptember = {
  id: "b1",
  checkIn: new Date("2026-09-01T00:00:00.000Z"),
  checkOut: new Date("2026-10-01T00:00:00.000Z"),
  nights: 30,
  totalAmount: 30000,
  source: "website",
  adults: 2,
  children: 0,
  room: { roomType: "deluxe" },
};

beforeEach(() => {
  vi.clearAllMocks();
  h.roomCount.mockResolvedValue(1);
  h.bookingFindMany.mockResolvedValue([wholeOfSeptember]);
});

describe("GET /api/admin/reports — monthly occupancy clamping", () => {
  it("counts only the nights inside the window, matching the KPI", async () => {
    const res = await GET(req({ from: "2026-09-15", to: "2026-09-19" }));
    const { data } = await res.json();

    // 15,16,17,18,19 — five nights, inclusive `to`.
    expect(data.kpi.occupiedNights).toBe(5);

    const sept = data.monthlySeries.find((m: { month: string }) => m.month === "2026-09");
    // Was 30. The bar and the KPI must be the same number.
    expect(sept.occupied).toBe(5);
    expect(sept.occupied).toBe(data.kpi.occupiedNights);
  });

  it("measures the month against the capacity actually in the window", async () => {
    const res = await GET(req({ from: "2026-09-15", to: "2026-09-19" }));
    const { data } = await res.json();

    const sept = data.monthlySeries.find((m: { month: string }) => m.month === "2026-09");
    // 5 occupied of 5 room-nights on offer — not 5 of 30.
    expect(sept.occupancyPct).toBe(100);
    expect(sept.occupancyPct).toBeCloseTo(data.kpi.occupancyRate, 5);
  });

  it("is unchanged for a range that covers whole months", async () => {
    const res = await GET(req({ from: "2026-09-01", to: "2026-09-30" }));
    const { data } = await res.json();

    const sept = data.monthlySeries.find((m: { month: string }) => m.month === "2026-09");
    expect(sept.occupied).toBe(30);
    expect(sept.occupancyPct).toBe(100);
  });

  it("splits a stay that straddles two months into the right buckets", async () => {
    h.bookingFindMany.mockResolvedValue([
      {
        ...wholeOfSeptember,
        checkIn: new Date("2026-09-28T00:00:00.000Z"),
        checkOut: new Date("2026-10-04T00:00:00.000Z"),
        nights: 6,
      },
    ]);

    const res = await GET(req({ from: "2026-09-01", to: "2026-10-31" }));
    const { data } = await res.json();

    const sept = data.monthlySeries.find((m: { month: string }) => m.month === "2026-09");
    const oct = data.monthlySeries.find((m: { month: string }) => m.month === "2026-10");

    expect(sept.occupied).toBe(3); // 28, 29, 30
    expect(oct.occupied).toBe(3); //  1, 2, 3
    expect(sept.occupied + oct.occupied).toBe(data.kpi.occupiedNights);
  });

  it("never reports occupancy above 100%", async () => {
    const res = await GET(req({ from: "2026-09-10", to: "2026-09-12" }));
    const { data } = await res.json();

    for (const m of data.monthlySeries) {
      expect(m.occupancyPct).toBeLessThanOrEqual(100);
    }
  });
});

/**
 * B-20 — revenue was added whole for any overlapping booking while nights were
 * clamped to the window. The monthly bars dropped revenue for a stay that
 * checked in before the range, and ADR divided a whole-stay numerator by a
 * clipped denominator.
 */
describe("GET /api/admin/reports — revenue is earned per night", () => {
  it("counts only the share of a clipped stay that falls in the window", async () => {
    // ₹30,000 over 30 nights = ₹1,000/night. Five nights in range.
    const res = await GET(req({ from: "2026-09-15", to: "2026-09-19" }));
    const { data } = await res.json();

    expect(data.kpi.totalRevenue).toBe(5000); // was 30000
    expect(data.kpi.adr).toBe(1000); // was 6000 — the real nightly rate
  });

  it("makes the monthly bars sum to the headline", async () => {
    const res = await GET(req({ from: "2026-09-15", to: "2026-09-19" }));
    const { data } = await res.json();

    const sum = data.monthlySeries.reduce((a: number, m: { revenue: number }) => a + m.revenue, 0);
    expect(sum).toBe(data.kpi.totalRevenue);
  });

  it("no longer drops revenue for a stay that checked in before the window", async () => {
    // Checks in 28 Aug, runs to 3 Sep. `monthKey(checkIn)` is "2026-08", which
    // has no bucket in a September report — the revenue used to vanish from the
    // series while still counting in the KPI.
    h.bookingFindMany.mockResolvedValue([
      {
        ...wholeOfSeptember,
        checkIn: new Date("2026-08-28T00:00:00.000Z"),
        checkOut: new Date("2026-09-03T00:00:00.000Z"),
        nights: 6,
        totalAmount: 6000, // ₹1,000/night
      },
    ]);

    const res = await GET(req({ from: "2026-09-01", to: "2026-09-30" }));
    const { data } = await res.json();

    const sept = data.monthlySeries.find((m: { month: string }) => m.month === "2026-09")!;
    // Two nights fall in September: the 1st and the 2nd.
    expect(sept.occupied).toBe(2);
    expect(sept.revenue).toBe(2000);
    expect(sept.revenue).toBe(data.kpi.totalRevenue);
    expect(sept.bookings).toBe(1); // counted, not dropped
  });

  it("splits revenue across months in step with the nights", async () => {
    h.bookingFindMany.mockResolvedValue([
      {
        ...wholeOfSeptember,
        checkIn: new Date("2026-09-28T00:00:00.000Z"),
        checkOut: new Date("2026-10-04T00:00:00.000Z"),
        nights: 6,
        totalAmount: 6000,
      },
    ]);

    const res = await GET(req({ from: "2026-09-01", to: "2026-10-31" }));
    const { data } = await res.json();

    const sept = data.monthlySeries.find((m: { month: string }) => m.month === "2026-09")!;
    const oct = data.monthlySeries.find((m: { month: string }) => m.month === "2026-10")!;

    expect(sept.revenue).toBe(3000); // 28, 29, 30
    expect(oct.revenue).toBe(3000); //   1,  2,  3
    expect(sept.revenue + oct.revenue).toBe(data.kpi.totalRevenue);
  });

  it("leaves a whole-month range exactly as it was", async () => {
    // Nothing is clipped, so every stay contributes its full amount — the
    // common case must not shift.
    const res = await GET(req({ from: "2026-09-01", to: "2026-09-30" }));
    const { data } = await res.json();

    expect(data.kpi.totalRevenue).toBe(30000);
    expect(data.sourceBreakdown[0].revenue).toBe(30000);
    expect(data.roomTypeBreakdown[0].revenue).toBe(30000);
  });

  it("keeps the source and room-type breakdowns on the same basis as the KPI", async () => {
    const res = await GET(req({ from: "2026-09-15", to: "2026-09-19" }));
    const { data } = await res.json();

    expect(data.sourceBreakdown[0].revenue).toBe(data.kpi.totalRevenue);
    expect(data.roomTypeBreakdown[0].revenue).toBe(data.kpi.totalRevenue);
  });

  it("counts every booking in exactly one month bucket", async () => {
    const res = await GET(req({ from: "2026-09-15", to: "2026-09-19" }));
    const { data } = await res.json();

    const sum = data.monthlySeries.reduce((a: number, m: { bookings: number }) => a + m.bookings, 0);
    expect(sum).toBe(data.kpi.totalBookings);
  });
});
