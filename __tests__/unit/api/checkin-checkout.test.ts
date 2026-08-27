import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// vi.mock is hoisted — declare mock fns with vi.hoisted so they're available in the factory
const { mockBookingFindUnique, mockTransaction } = vi.hoisted(() => ({
  mockBookingFindUnique: vi.fn(),
  mockTransaction: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/admin-auth", () => ({
  verifyAdminToken: vi.fn().mockResolvedValue({ staffId: "s1", role: "owner", name: "Admin", email: "a@a.com" }),
  resolveActiveStaff: vi.fn().mockResolvedValue({ staffId: "s1", role: "owner", name: "Admin", email: "a@a.com" }),
  ADMIN_COOKIE: "admin_token",
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    booking: {
      findUnique: mockBookingFindUnique,
      update: vi.fn().mockResolvedValue({}),
    },
    roomStatus: { upsert: vi.fn().mockResolvedValue({}) },
    housekeepingLog: { create: vi.fn().mockResolvedValue({}) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    $transaction: mockTransaction,
  },
}));

import { PATCH as checkin } from "@/app/api/admin/bookings/[id]/checkin/route";
import { PATCH as checkout } from "@/app/api/admin/bookings/[id]/checkout/route";

function makeReq(path = "/api/admin/bookings/bk1/checkin") {
  const req = new NextRequest(`http://localhost${path}`, { method: "PATCH" });
  req.cookies.set("admin_token", "mock_token");
  return req;
}

const params = { id: "bk1" };

describe("PATCH /api/admin/bookings/[id]/checkin", () => {
  beforeEach(() => { mockBookingFindUnique.mockReset(); mockTransaction.mockReset(); mockTransaction.mockResolvedValue([]); });

  it("returns 401 when auth token is invalid", async () => {
    const { resolveActiveStaff } = await import("@/lib/admin-auth");
    vi.mocked(resolveActiveStaff).mockResolvedValueOnce(null as never);
    // Use makeReq() so the cookie is present and verifyAdminToken is actually called
    const res = await checkin(makeReq(), { params });
    expect(res.status).toBe(401);
  });

  it("returns 404 when booking does not exist", async () => {
    mockBookingFindUnique.mockResolvedValueOnce(null);
    const res = await checkin(makeReq(), { params });
    expect(res.status).toBe(404);
  });

  it("returns 400 when booking is already checked_in", async () => {
    mockBookingFindUnique.mockResolvedValueOnce({
      id: "bk1", status: "checked_in", roomId: "r1", guestId: null, guestName: "Test Guest",
    });
    const res = await checkin(makeReq(), { params });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/cannot check in/i);
  });

  it("returns 400 when booking is cancelled", async () => {
    mockBookingFindUnique.mockResolvedValueOnce({
      id: "bk1", status: "cancelled", roomId: "r1", guestId: null, guestName: "Test Guest",
    });
    const res = await checkin(makeReq(), { params });
    expect(res.status).toBe(400);
  });

  it("succeeds for a confirmed booking and returns guest name in message", async () => {
    mockBookingFindUnique.mockResolvedValueOnce({
      id: "bk1", status: "confirmed", roomId: "r1", guestId: null, guestName: "Ravi Kumar",
    });
    const res = await checkin(makeReq(), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toMatch(/Ravi Kumar/);
  });

  it("executes a database transaction on successful check-in", async () => {
    mockBookingFindUnique.mockResolvedValueOnce({
      id: "bk1", status: "confirmed", roomId: "r1", guestId: null, guestName: "Ravi Kumar",
    });
    await checkin(makeReq(), { params });
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });
});

describe("PATCH /api/admin/bookings/[id]/checkout", () => {
  beforeEach(() => { mockBookingFindUnique.mockReset(); mockTransaction.mockReset(); mockTransaction.mockResolvedValue([]); });

  it("returns 401 when auth token is invalid", async () => {
    const { resolveActiveStaff } = await import("@/lib/admin-auth");
    vi.mocked(resolveActiveStaff).mockResolvedValueOnce(null as never);
    const res = await checkout(makeReq("/api/admin/bookings/bk1/checkout"), { params });
    expect(res.status).toBe(401);
  });

  it("returns 404 when booking does not exist", async () => {
    mockBookingFindUnique.mockResolvedValueOnce(null);
    const res = await checkout(makeReq("/api/admin/bookings/bk1/checkout"), { params });
    expect(res.status).toBe(404);
  });

  it("returns 400 when booking is still confirmed (not yet checked in)", async () => {
    mockBookingFindUnique.mockResolvedValueOnce({
      id: "bk1", status: "confirmed", roomId: "r1", guestName: "Test Guest", bookingNumber: "BK001",
    });
    const res = await checkout(makeReq("/api/admin/bookings/bk1/checkout"), { params });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/cannot check out/i);
  });

  it("returns 400 when booking is already checked_out", async () => {
    mockBookingFindUnique.mockResolvedValueOnce({
      id: "bk1", status: "checked_out", roomId: "r1", guestName: "Test Guest", bookingNumber: "BK001",
    });
    const res = await checkout(makeReq("/api/admin/bookings/bk1/checkout"), { params });
    expect(res.status).toBe(400);
  });

  it("succeeds for a checked_in booking and returns guest name in message", async () => {
    mockBookingFindUnique.mockResolvedValueOnce({
      id: "bk1", status: "checked_in", roomId: "r1", guestName: "Ravi Kumar", bookingNumber: "BK002",
    });
    const res = await checkout(makeReq("/api/admin/bookings/bk1/checkout"), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toMatch(/Ravi Kumar/);
  });

  it("executes a transaction that includes creating a housekeeping task", async () => {
    mockBookingFindUnique.mockResolvedValueOnce({
      id: "bk1", status: "checked_in", roomId: "r1", guestName: "Ravi Kumar", bookingNumber: "BK003",
    });
    await checkout(makeReq("/api/admin/bookings/bk1/checkout"), { params });
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });
});
