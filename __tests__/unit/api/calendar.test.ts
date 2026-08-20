import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockRoomFindMany, mockBookingFindMany, mockBlockedFindMany } = vi.hoisted(() => ({
  mockRoomFindMany: vi.fn().mockResolvedValue([]),
  mockBookingFindMany: vi.fn().mockResolvedValue([]),
  mockBlockedFindMany: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/admin-auth", () => ({
  verifyAdminToken: vi.fn().mockResolvedValue({ staffId: "s1", role: "owner", name: "Admin", email: "a@a.com" }),
  ADMIN_COOKIE: "admin_token",
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    room: { findMany: mockRoomFindMany },
    booking: { findMany: mockBookingFindMany },
    blockedDate: { findMany: mockBlockedFindMany },
  },
}));

import { GET } from "@/app/api/admin/calendar/route";

function makeReq(params?: Record<string, string>) {
  const url = new URL("http://localhost/api/admin/calendar");
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const req = new NextRequest(url.toString(), { method: "GET" });
  req.cookies.set("admin_token", "mock_token");
  return req;
}

const mockRoom = { id: "r1", name: "Deluxe Room", roomNumber: "101", roomType: "deluxe", floor: 1 };
const mockBooking = {
  id: "bk1", bookingNumber: "BK001", guestName: "Ravi Kumar", roomId: "r1",
  checkIn: new Date("2026-06-05"), checkOut: new Date("2026-06-08"),
  nights: 3, status: "confirmed", adults: 2, totalAmount: 15000,
};

describe("GET /api/admin/calendar", () => {
  it("returns 401 without auth", async () => {
    const { verifyAdminToken } = await import("@/lib/admin-auth");
    vi.mocked(verifyAdminToken).mockResolvedValueOnce(null as never);
    const res = await GET(makeReq({ month: "2026-06" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid month format", async () => {
    const res = await GET(makeReq({ month: "June-2026" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for out-of-range month", async () => {
    const res = await GET(makeReq({ month: "2026-13" }));
    expect(res.status).toBe(400);
  });

  it("returns 200 with rooms, bookings, blockedDates, daysInMonth for June (30 days)", async () => {
    mockRoomFindMany.mockResolvedValueOnce([mockRoom]);
    mockBookingFindMany.mockResolvedValueOnce([mockBooking]);
    mockBlockedFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeReq({ month: "2026-06" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.daysInMonth).toBe(30);
    expect(body.data.rooms).toHaveLength(1);
    expect(body.data.bookings).toHaveLength(1);
    expect(body.data.blockedDates).toHaveLength(0);
  });

  it("returns 31 daysInMonth for January", async () => {
    mockRoomFindMany.mockResolvedValueOnce([]);
    mockBookingFindMany.mockResolvedValueOnce([]);
    mockBlockedFindMany.mockResolvedValueOnce([]);
    const res = await GET(makeReq({ month: "2026-01" }));
    const body = await res.json();
    expect(body.data.daysInMonth).toBe(31);
  });

  it("returns 28 daysInMonth for February 2026 (non-leap)", async () => {
    mockRoomFindMany.mockResolvedValueOnce([]);
    mockBookingFindMany.mockResolvedValueOnce([]);
    mockBlockedFindMany.mockResolvedValueOnce([]);
    const res = await GET(makeReq({ month: "2026-02" }));
    const body = await res.json();
    expect(body.data.daysInMonth).toBe(28);
  });

  it("serialises booking dates to ISO strings", async () => {
    mockRoomFindMany.mockResolvedValueOnce([]);
    mockBookingFindMany.mockResolvedValueOnce([mockBooking]);
    mockBlockedFindMany.mockResolvedValueOnce([]);
    const res = await GET(makeReq({ month: "2026-06" }));
    const { data } = await res.json();
    expect(typeof data.bookings[0].checkIn).toBe("string");
    expect(typeof data.bookings[0].checkOut).toBe("string");
  });

  it("includes blocked dates with roomId and date serialised", async () => {
    const bd = { id: "bd1", roomId: "r1", blockDate: new Date("2026-06-15"), reason: "Maintenance" };
    mockRoomFindMany.mockResolvedValueOnce([]);
    mockBookingFindMany.mockResolvedValueOnce([]);
    mockBlockedFindMany.mockResolvedValueOnce([bd]);
    const res = await GET(makeReq({ month: "2026-06" }));
    const { data } = await res.json();
    expect(data.blockedDates).toHaveLength(1);
    expect(data.blockedDates[0].roomId).toBe("r1");
    expect(typeof data.blockedDates[0].blockDate).toBe("string");
  });

  it("supports a rolling ?from=&days= window", async () => {
    mockRoomFindMany.mockResolvedValueOnce([]);
    mockBookingFindMany.mockResolvedValueOnce([]);
    mockBlockedFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeReq({ from: "2026-08-08", days: "90" }));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.rangeStart).toBe("2026-08-08");
    expect(data.days).toBe(90);
    // Range mode is not a month, so the month-only fields are null.
    expect(data.daysInMonth).toBeNull();
    expect(data.monthStart).toBeNull();
  });

  it("queries bookings across the whole window, not just one month", async () => {
    mockRoomFindMany.mockResolvedValueOnce([]);
    mockBookingFindMany.mockResolvedValueOnce([]);
    mockBlockedFindMany.mockResolvedValueOnce([]);

    await GET(makeReq({ from: "2026-08-08", days: "90" }));
    const where = mockBookingFindMany.mock.calls.at(-1)?.[0].where;
    // 8 Aug + 90 days = 6 Nov — the window must span past August.
    //
    // Bounds are UTC midnight, because `checkIn`/`checkOut` are DATE columns.
    // These assertions used to read `new Date(2026, 10, 6)` — local midnight,
    // which on this IST dev box is 18:30 UTC on 5 Nov. Postgres casts that
    // back to the 5th, so the window silently started and ended a day early.
    // Asserting in local time is what let that ship. See lib/dates.ts.
    expect((where.checkIn.lt as Date).toISOString()).toBe("2026-11-06T00:00:00.000Z");
    expect((where.checkOut.gt as Date).toISOString()).toBe("2026-08-08T00:00:00.000Z");
  });

  it("clamps an oversized days value", async () => {
    mockRoomFindMany.mockResolvedValueOnce([]);
    mockBookingFindMany.mockResolvedValueOnce([]);
    mockBlockedFindMany.mockResolvedValueOnce([]);
    const res = await GET(makeReq({ from: "2026-08-08", days: "9999" }));
    const { data } = await res.json();
    expect(data.days).toBe(180);
  });

  it("returns 400 for a malformed from date", async () => {
    const res = await GET(makeReq({ from: "08-08-2026" }));
    expect(res.status).toBe(400);
  });

  it("uses current month when month param is omitted", async () => {
    mockRoomFindMany.mockResolvedValueOnce([]);
    mockBookingFindMany.mockResolvedValueOnce([]);
    mockBlockedFindMany.mockResolvedValueOnce([]);
    const res = await GET(makeReq()); // no month param
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveProperty("daysInMonth");
  });
});
