import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const {
  mockFindMany, mockUpdateMany, mockAggregate, mockUpsert, mockAuditCreate,
  mockRoomStatusUpdateMany, mockGuestUpdate,
} = vi.hoisted(() => ({
  mockFindMany: vi.fn().mockResolvedValue([]),
  mockUpdateMany: vi.fn().mockResolvedValue({ count: 0 }),
  mockAggregate: vi.fn().mockResolvedValue({ _sum: { totalAmount: null }, _count: { _all: 0 } }),
  mockUpsert: vi.fn().mockResolvedValue({}),
  mockAuditCreate: vi.fn().mockResolvedValue({}),
  // The audit releases rooms held by no-shows and recomputes guest totals.
  mockRoomStatusUpdateMany: vi.fn().mockResolvedValue({ count: 0 }),
  mockGuestUpdate: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/admin-auth", () => ({
  verifyAdminToken: vi.fn().mockResolvedValue({ staffId: "s1", role: "owner", name: "Admin", email: "a@a.com" }),
  ADMIN_COOKIE: "admin_token",
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    booking: { findMany: mockFindMany, updateMany: mockUpdateMany, aggregate: mockAggregate },
    roomStatus: { upsert: mockUpsert, updateMany: mockRoomStatusUpdateMany },
    guest: { update: mockGuestUpdate },
    auditLog: { create: mockAuditCreate },
  },
}));

import { GET } from "@/app/api/admin/night-audit/summary/route";
import { POST } from "@/app/api/admin/night-audit/run/route";

function makeReq(method: "GET" | "POST") {
  const req = new NextRequest(`http://localhost/api/admin/night-audit/${method === "GET" ? "summary" : "run"}`, { method });
  req.cookies.set("admin_token", "mock_token");
  return req;
}

const sampleBooking = {
  id: "bk1", bookingNumber: "BK001", guestName: "Ravi Kumar", guestPhone: "9876543210",
  checkIn: new Date("2026-06-01"), checkOut: new Date("2026-06-03"),
  nights: 2, totalAmount: 10000, status: "confirmed", paymentStatus: "paid",
  room: { name: "Deluxe", roomNumber: "101", roomType: "deluxe" },
};

describe("GET /api/admin/night-audit/summary", () => {
  beforeEach(() => { mockFindMany.mockReset(); mockFindMany.mockResolvedValue([]); mockAggregate.mockReset(); mockAggregate.mockResolvedValue({ _sum: { totalAmount: null }, _count: { _all: 0 } }); });

  it("returns 401 without auth", async () => {
    const { verifyAdminToken } = await import("@/lib/admin-auth");
    vi.mocked(verifyAdminToken).mockResolvedValueOnce(null as never);
    const res = await GET(makeReq("GET"));
    expect(res.status).toBe(401);
  });

  it("returns 200 with summary containing all sections", async () => {
    const res = await GET(makeReq("GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("arrivals");
    expect(body.data).toHaveProperty("departures");
    expect(body.data).toHaveProperty("noShows");
    expect(body.data).toHaveProperty("inHouse");
    expect(body.data).toHaveProperty("todayRevenue");
    expect(body.data).toHaveProperty("date");
  });

  it("returns arrivals as a list with serialised dates", async () => {
    // findMany called 4 times: arrivals, departures, noShows, inHouse
    mockFindMany
      .mockResolvedValueOnce([sampleBooking]) // arrivals
      .mockResolvedValueOnce([])              // departures
      .mockResolvedValueOnce([])              // noShows
      .mockResolvedValueOnce([]);             // inHouse
    const res = await GET(makeReq("GET"));
    const { data: summary } = await res.json();
    expect(summary.arrivals).toHaveLength(1);
    expect(typeof summary.arrivals[0].checkIn).toBe("string");
  });

  it("returns todayRevenue as 0 when no paid bookings today", async () => {
    mockAggregate.mockResolvedValueOnce({ _sum: { totalAmount: null } });
    const res = await GET(makeReq("GET"));
    const { data: summary } = await res.json();
    expect(summary.todayRevenue).toBe(0);
  });

  it("returns todayRevenue as a number from aggregate result", async () => {
    mockAggregate.mockResolvedValueOnce({ _sum: { totalAmount: 25000 } });
    const res = await GET(makeReq("GET"));
    const { data: summary } = await res.json();
    expect(summary.todayRevenue).toBe(25000);
  });
});

describe("POST /api/admin/night-audit/run", () => {
  beforeEach(() => {
    mockUpdateMany.mockReset(); mockUpdateMany.mockResolvedValue({ count: 0 });
    mockFindMany.mockReset(); mockFindMany.mockResolvedValue([]);
    mockUpsert.mockReset(); mockUpsert.mockResolvedValue({});
    mockAuditCreate.mockReset(); mockAuditCreate.mockResolvedValue({});
  });

  it("returns 401 without auth", async () => {
    const { verifyAdminToken } = await import("@/lib/admin-auth");
    vi.mocked(verifyAdminToken).mockResolvedValueOnce(null as never);
    const res = await POST(makeReq("POST"));
    expect(res.status).toBe(401);
  });

  it("returns 200 with audit result counts", async () => {
    mockUpdateMany.mockResolvedValueOnce({ count: 2 }); // no-shows
    mockFindMany
      // The route now reads the missed bookings first so it can release the
      // rooms they were holding and correct their guests' totals.
      .mockResolvedValueOnce([{ id: "bk0", guestId: "g0" }]) // missed arrivals
      .mockResolvedValueOnce([{ id: "bk1", roomId: "r1" }]) // today arrivals
      .mockResolvedValueOnce([{ id: "bk2", roomId: "r2" }]); // today departures
    const res = await POST(makeReq("POST"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.noShowsMarked).toBe(2);
    expect(body.data.arrivalsFlagged).toBe(1);
    expect(body.data.departuresFlagged).toBe(1);
  });

  it("marks confirmed bookings with past checkIn as no_show", async () => {
    await POST(makeReq("POST"));
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "no_show" } })
    );
  });

  it("upserts room status for today's arrivals", async () => {
    mockFindMany.mockResolvedValueOnce([]);                             // missed arrivals
    mockFindMany.mockResolvedValueOnce([{ id: "bk1", roomId: "r1" }]); // arrivals
    mockFindMany.mockResolvedValueOnce([]);                             // departures
    await POST(makeReq("POST"));
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ occupancy: "due_checkin" }),
      })
    );
  });

  it("writes an audit log entry on completion", async () => {
    await POST(makeReq("POST"));
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "night_audit_run" }) })
    );
  });
});
