import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockBookingFindMany, mockExpenseFindMany } = vi.hoisted(() => ({
  mockBookingFindMany: vi.fn().mockResolvedValue([]),
  mockExpenseFindMany: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/admin-auth", () => ({
  verifyAdminToken: vi.fn().mockResolvedValue({ staffId: "s1", role: "owner", name: "Admin", email: "a@a.com" }),
  resolveActiveStaff: vi.fn().mockResolvedValue({ staffId: "s1", role: "owner", name: "Admin", email: "a@a.com" }),
  ADMIN_COOKIE: "admin_token",
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    booking: { findMany: mockBookingFindMany },
    expense: { findMany: mockExpenseFindMany },
  },
}));

import { GET } from "@/app/api/admin/reconciliation/route";

function makeReq(params?: Record<string, string>) {
  const url = new URL("http://localhost/api/admin/reconciliation");
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const req = new NextRequest(url.toString(), { method: "GET" });
  req.cookies.set("admin_token", "mock_token");
  return req;
}

function booking(opts: {
  checkIn: string;
  amount: number;
  source?: string;
  paymentStatus?: string;
  bookingNumber?: string;
}) {
  return {
    checkIn: new Date(opts.checkIn),
    totalAmount: opts.amount,
    source: opts.source ?? "website",
    bookingNumber: opts.bookingNumber ?? "BK-1",
    guestName: "Guest",
    room: { name: "Room", roomNumber: "101" },
  };
}

describe("GET /api/admin/reconciliation", () => {
  beforeEach(() => {
    mockBookingFindMany.mockReset(); mockBookingFindMany.mockResolvedValue([]);
    mockExpenseFindMany.mockReset(); mockExpenseFindMany.mockResolvedValue([]);
  });

  it("returns 401 without auth", async () => {
    const { resolveActiveStaff } = await import("@/lib/admin-auth");
    vi.mocked(resolveActiveStaff).mockResolvedValueOnce(null as never);
    const res = await GET(makeReq({ month: "2026-08" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for a malformed month", async () => {
    const res = await GET(makeReq({ month: "2026/08" }));
    expect(res.status).toBe(400);
  });

  // B-35 — Reconciliation used to query only `paymentStatus in (paid, cash)`,
  // which silently dropped every OTA booking: those sit at `pending` for their
  // whole life because the guest paid the channel, not us (see CLAUDE.md and
  // lib/labels.ts CHANNEL_PAID_SOURCES). A ₹33,600 Booking.com stay vanished
  // from both the monthly total and "Revenue by Source" — the channel wasn't
  // even listed, let alone credited.
  it("counts a pending OTA booking as revenue, alongside paid ones", async () => {
    mockBookingFindMany.mockResolvedValueOnce([
      booking({ checkIn: "2026-08-05", amount: 20000, source: "website", paymentStatus: "paid" }),
      booking({ checkIn: "2026-08-10", amount: 33600, source: "booking_com", paymentStatus: "pending" }),
    ]);
    const res = await GET(makeReq({ month: "2026-08" }));
    const body = await res.json();
    expect(body.data.revenue.total).toBe(53600);
    const bcom = body.data.revenue.bySource.find((s: { source: string }) => s.source === "booking_com");
    expect(bcom).toBeTruthy();
    expect(bcom.amount).toBe(33600);
  });

  it("still excludes a pending walk-in — pending there means genuinely unpaid", async () => {
    mockBookingFindMany.mockResolvedValueOnce([
      booking({ checkIn: "2026-08-05", amount: 20000, source: "walkin", paymentStatus: "paid" }),
    ]);
    await GET(makeReq({ month: "2026-08" }));
    const where = mockBookingFindMany.mock.calls[0][0].where;
    // The query must not simply drop the paymentStatus filter — it should
    // still require paid/cash OR (a channel source AND pending), never a bare
    // "any status" match that would recount every abandoned hold as revenue.
    expect(where.OR).toEqual([
      { paymentStatus: { in: ["paid", "cash"] } },
      { source: { in: ["booking_com", "mmt", "goibibo", "airbnb"] }, paymentStatus: "pending" },
    ]);
  });

  it("excludes cancelled and no_show bookings regardless of source", async () => {
    await GET(makeReq({ month: "2026-08" }));
    expect(mockBookingFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { notIn: ["cancelled", "no_show"] } }),
      })
    );
  });
});
