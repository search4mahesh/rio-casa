import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockShiftFindMany, mockShiftUpsert, mockShiftDelete, mockStaffFindMany, mockStaffFindUnique } = vi.hoisted(() => ({
  mockShiftFindMany: vi.fn().mockResolvedValue([]),
  mockShiftUpsert: vi.fn().mockResolvedValue({ id: "sh1" }),
  mockShiftDelete: vi.fn().mockResolvedValue({}),
  mockStaffFindMany: vi.fn().mockResolvedValue([]),
  mockStaffFindUnique: vi.fn().mockResolvedValue({ id: "staff1", isActive: true }),
}));

vi.mock("@/lib/admin-auth", () => ({
  verifyAdminToken: vi.fn().mockResolvedValue({ staffId: "s1", role: "owner", name: "Admin", email: "a@a.com" }),
  ADMIN_COOKIE: "admin_token",
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    shiftAssignment: { findMany: mockShiftFindMany, upsert: mockShiftUpsert, delete: mockShiftDelete },
    staff: { findMany: mockStaffFindMany, findUnique: mockStaffFindUnique },
  },
}));

import { GET, POST } from "@/app/api/admin/shifts/route";
import { DELETE } from "@/app/api/admin/shifts/[id]/route";

function makeReq(method: string, body?: object, queryStr = "") {
  const init: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body) init.body = JSON.stringify(body);
  const req = new NextRequest(`http://localhost/api/admin/shifts${queryStr}`, init);
  req.cookies.set("admin_token", "mock_token");
  return req;
}

const idParams = { params: Promise.resolve({ id: "sh1" }) };
const validAssignment = { date: "2026-06-15", slot: "morning", station: "frontdesk", staffId: "staff1" };

describe("GET /api/admin/shifts", () => {
  beforeEach(() => {
    mockShiftFindMany.mockReset(); mockShiftFindMany.mockResolvedValue([]);
    mockStaffFindMany.mockReset(); mockStaffFindMany.mockResolvedValue([]);
  });

  it("returns 401 without auth", async () => {
    const { verifyAdminToken } = await import("@/lib/admin-auth");
    vi.mocked(verifyAdminToken).mockResolvedValueOnce(null as never);
    const res = await GET(makeReq("GET", undefined, "?weekStart=2026-06-15"));
    expect(res.status).toBe(401);
  });

  it("returns 400 when weekStart is missing", async () => {
    const res = await GET(makeReq("GET"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when weekStart is malformed", async () => {
    const res = await GET(makeReq("GET", undefined, "?weekStart=15-06-2026"));
    expect(res.status).toBe(400);
  });

  it("returns assignments and staff for the week", async () => {
    mockShiftFindMany.mockResolvedValueOnce([{ id: "a1", staffId: "s1", staff: { id: "s1", name: "Ravi", role: "frontdesk" } }]);
    mockStaffFindMany.mockResolvedValueOnce([{ id: "s1", name: "Ravi", role: "frontdesk" }]);
    const res = await GET(makeReq("GET", undefined, "?weekStart=2026-06-15"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.assignments).toHaveLength(1);
    expect(body.staff).toHaveLength(1);
  });

  it("queries shifts for exactly the 7-day window", async () => {
    await GET(makeReq("GET", undefined, "?weekStart=2026-06-15"));
    const call = mockShiftFindMany.mock.calls[0][0];
    const range = call.where.date;
    expect(range.gte).toEqual(new Date("2026-06-15T00:00:00"));
    const end = new Date("2026-06-15T00:00:00"); end.setDate(end.getDate() + 7);
    expect(range.lt).toEqual(end);
  });

  it("returns only active staff", async () => {
    await GET(makeReq("GET", undefined, "?weekStart=2026-06-15"));
    expect(mockStaffFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } })
    );
  });
});

describe("POST /api/admin/shifts", () => {
  beforeEach(() => {
    mockShiftUpsert.mockReset(); mockShiftUpsert.mockResolvedValue({ id: "sh1", staff: { id: "staff1", name: "Ravi", role: "frontdesk" } });
    mockStaffFindUnique.mockReset(); mockStaffFindUnique.mockResolvedValue({ id: "staff1", isActive: true });
  });

  it("creates a new assignment", async () => {
    const res = await POST(makeReq("POST", validAssignment));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("uses upsert keyed on (date, slot, station) so re-assigning replaces", async () => {
    await POST(makeReq("POST", validAssignment));
    const call = mockShiftUpsert.mock.calls[0][0];
    expect(call.where.date_slot_station.slot).toBe("morning");
    expect(call.where.date_slot_station.station).toBe("frontdesk");
  });

  it("rejects invalid slot", async () => {
    const res = await POST(makeReq("POST", { ...validAssignment, slot: "midday" }));
    expect(res.status).toBe(400);
  });

  it("rejects invalid station", async () => {
    const res = await POST(makeReq("POST", { ...validAssignment, station: "garden" }));
    expect(res.status).toBe(400);
  });

  it("rejects invalid date format", async () => {
    const res = await POST(makeReq("POST", { ...validAssignment, date: "15-06-2026" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when staff does not exist", async () => {
    mockStaffFindUnique.mockResolvedValueOnce(null);
    const res = await POST(makeReq("POST", validAssignment));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/staff/i);
  });

  it("returns 400 when assigning inactive staff", async () => {
    mockStaffFindUnique.mockResolvedValueOnce({ id: "staff1", isActive: false });
    const res = await POST(makeReq("POST", validAssignment));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/inactive/i);
  });

  it("returns 401 without auth", async () => {
    const { verifyAdminToken } = await import("@/lib/admin-auth");
    vi.mocked(verifyAdminToken).mockResolvedValueOnce(null as never);
    const res = await POST(makeReq("POST", validAssignment));
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/admin/shifts/[id]", () => {
  beforeEach(() => { mockShiftDelete.mockReset(); });

  it("deletes an assignment", async () => {
    mockShiftDelete.mockResolvedValueOnce({});
    const res = await DELETE(makeReq("DELETE"), idParams);
    expect(res.status).toBe(200);
  });

  it("returns 404 when assignment does not exist", async () => {
    mockShiftDelete.mockRejectedValueOnce(new Error("Not found"));
    const res = await DELETE(makeReq("DELETE"), idParams);
    expect(res.status).toBe(404);
  });

  it("returns 401 without auth", async () => {
    const { verifyAdminToken } = await import("@/lib/admin-auth");
    vi.mocked(verifyAdminToken).mockResolvedValueOnce(null as never);
    const res = await DELETE(makeReq("DELETE"), idParams);
    expect(res.status).toBe(401);
  });
});
