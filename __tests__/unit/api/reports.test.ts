import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockBookingFindMany, mockRoomCount } = vi.hoisted(() => ({
  mockBookingFindMany: vi.fn().mockResolvedValue([]),
  mockRoomCount: vi.fn().mockResolvedValue(9),
}));

vi.mock("@/lib/admin-auth", () => ({
  verifyAdminToken: vi.fn().mockResolvedValue({ staffId: "s1", role: "owner", name: "Admin", email: "a@a.com" }),
  ADMIN_COOKIE: "admin_token",
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    room: { count: mockRoomCount },
    booking: { findMany: mockBookingFindMany },
  },
}));

import { GET } from "@/app/api/admin/reports/route";

function makeReq(params?: Record<string, string>) {
  const url = new URL("http://localhost/api/admin/reports");
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const req = new NextRequest(url.toString(), { method: "GET" });
  req.cookies.set("admin_token", "mock_token");
  return req;
}

function booking(opts: { checkIn: string; checkOut: string; nights: number; amount: number; source?: string; roomType?: string; adults?: number; children?: number }) {
  return {
    id: "bk", checkIn: new Date(opts.checkIn), checkOut: new Date(opts.checkOut),
    nights: opts.nights, totalAmount: opts.amount,
    source: opts.source ?? "website",
    adults: opts.adults ?? 2, children: opts.children ?? 0,
    room: { roomType: opts.roomType ?? "deluxe" },
  };
}

describe("GET /api/admin/reports", () => {
  beforeEach(() => {
    mockBookingFindMany.mockReset(); mockBookingFindMany.mockResolvedValue([]);
    mockRoomCount.mockReset(); mockRoomCount.mockResolvedValue(9);
  });

  it("returns 401 without auth", async () => {
    const { verifyAdminToken } = await import("@/lib/admin-auth");
    vi.mocked(verifyAdminToken).mockResolvedValueOnce(null as never);
    const res = await GET(makeReq({ from: "2026-01-01", to: "2026-12-31" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when 'to' is before 'from'", async () => {
    const res = await GET(makeReq({ from: "2026-12-01", to: "2026-01-01" }));
    expect(res.status).toBe(400);
  });

  it("uses default last-12-months range when no params provided", async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.report.daysInRange).toBeGreaterThan(300);
  });

  it("returns zero KPIs when no bookings exist", async () => {
    const res = await GET(makeReq({ from: "2026-06-01", to: "2026-06-30" }));
    const body = await res.json();
    expect(body.report.kpi.occupancyRate).toBe(0);
    expect(body.report.kpi.adr).toBe(0);
    expect(body.report.kpi.revpar).toBe(0);
    expect(body.report.kpi.totalBookings).toBe(0);
    expect(body.report.kpi.totalRevenue).toBe(0);
  });

  it("calculates occupancy correctly for a single 3-night booking in June (9 rooms × 30 days)", async () => {
    // 3 nights occupied out of 9 × 30 = 270 total = 1.11%
    mockBookingFindMany.mockResolvedValueOnce([
      booking({ checkIn: "2026-06-10", checkOut: "2026-06-13", nights: 3, amount: 15000 }),
    ]);
    const res = await GET(makeReq({ from: "2026-06-01", to: "2026-06-30" }));
    const body = await res.json();
    expect(body.report.kpi.occupiedNights).toBe(3);
    expect(body.report.kpi.totalRevenue).toBe(15000);
    expect(body.report.kpi.totalBookings).toBe(1);
  });

  it("calculates ADR as revenue / occupied nights", async () => {
    mockBookingFindMany.mockResolvedValueOnce([
      booking({ checkIn: "2026-06-10", checkOut: "2026-06-13", nights: 3, amount: 15000 }),
    ]);
    const res = await GET(makeReq({ from: "2026-06-01", to: "2026-06-30" }));
    const body = await res.json();
    expect(body.report.kpi.adr).toBe(5000); // 15000 / 3
  });

  it("breaks down bookings by source", async () => {
    mockBookingFindMany.mockResolvedValueOnce([
      booking({ checkIn: "2026-06-10", checkOut: "2026-06-12", nights: 2, amount: 10000, source: "website" }),
      booking({ checkIn: "2026-06-15", checkOut: "2026-06-17", nights: 2, amount: 12000, source: "booking_com" }),
      booking({ checkIn: "2026-06-20", checkOut: "2026-06-22", nights: 2, amount: 8000, source: "website" }),
    ]);
    const res = await GET(makeReq({ from: "2026-06-01", to: "2026-06-30" }));
    const body = await res.json();
    expect(body.report.sourceBreakdown).toHaveLength(2);
    const website = body.report.sourceBreakdown.find((s: { source: string }) => s.source === "website");
    expect(website.bookings).toBe(2);
    expect(website.revenue).toBe(18000);
  });

  it("breaks down revenue by room type", async () => {
    mockBookingFindMany.mockResolvedValueOnce([
      booking({ checkIn: "2026-06-10", checkOut: "2026-06-12", nights: 2, amount: 10000, roomType: "deluxe" }),
      booking({ checkIn: "2026-06-15", checkOut: "2026-06-17", nights: 2, amount: 18000, roomType: "premium" }),
    ]);
    const res = await GET(makeReq({ from: "2026-06-01", to: "2026-06-30" }));
    const body = await res.json();
    expect(body.report.roomTypeBreakdown).toHaveLength(2);
    // sorted by revenue desc — premium first
    expect(body.report.roomTypeBreakdown[0].roomType).toBe("premium");
    expect(body.report.roomTypeBreakdown[0].revenue).toBe(18000);
  });

  it("includes a monthly series with one entry per month in the range", async () => {
    const res = await GET(makeReq({ from: "2026-01-01", to: "2026-03-31" }));
    const body = await res.json();
    expect(body.report.monthlySeries).toHaveLength(3);
    expect(body.report.monthlySeries[0].month).toBe("2026-01");
    expect(body.report.monthlySeries[2].month).toBe("2026-03");
  });

  it("counts total guests as sum of adults + children across bookings", async () => {
    mockBookingFindMany.mockResolvedValueOnce([
      booking({ checkIn: "2026-06-10", checkOut: "2026-06-12", nights: 2, amount: 10000, adults: 2, children: 1 }),
      booking({ checkIn: "2026-06-15", checkOut: "2026-06-17", nights: 2, amount: 12000, adults: 3, children: 0 }),
    ]);
    const res = await GET(makeReq({ from: "2026-06-01", to: "2026-06-30" }));
    const body = await res.json();
    expect(body.report.kpi.totalGuests).toBe(6); // (2+1) + (3+0)
  });

  it("excludes cancelled and no_show bookings from queries", async () => {
    await GET(makeReq({ from: "2026-06-01", to: "2026-06-30" }));
    expect(mockBookingFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { notIn: ["cancelled", "no_show"] },
        }),
      })
    );
  });
});
