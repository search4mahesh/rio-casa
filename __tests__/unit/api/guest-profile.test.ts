import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockFindUnique, mockUpdate, mockAuditCreate } = vi.hoisted(() => ({
  mockFindUnique: vi.fn().mockResolvedValue(null),
  mockUpdate: vi.fn().mockResolvedValue({ id: "g1" }),
  mockAuditCreate: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/admin-auth", () => ({
  verifyAdminToken: vi.fn().mockResolvedValue({ staffId: "s1", role: "owner", name: "Admin", email: "a@a.com" }),
  ADMIN_COOKIE: "admin_token",
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    guest: { findUnique: mockFindUnique, update: mockUpdate },
    auditLog: { create: mockAuditCreate },
  },
}));

import { GET, PATCH } from "@/app/api/admin/guests/[id]/route";

function makeReq(method: string, body?: object) {
  const init: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body) init.body = JSON.stringify(body);
  const req = new NextRequest("http://localhost/api/admin/guests/g1", init);
  req.cookies.set("admin_token", "mock_token");
  return req;
}

const idParams = { params: Promise.resolve({ id: "g1" }) };

const mockGuest = {
  id: "g1", firstName: "Ravi", lastName: "Kumar",
  phone: "9876543210", email: "ravi@example.com",
  bookings: [], invoices: [],
};

describe("GET /api/admin/guests/[id]", () => {
  beforeEach(() => { mockFindUnique.mockReset(); });

  it("returns 401 without auth", async () => {
    const { verifyAdminToken } = await import("@/lib/admin-auth");
    vi.mocked(verifyAdminToken).mockResolvedValueOnce(null as never);
    const res = await GET(makeReq("GET"), idParams);
    expect(res.status).toBe(401);
  });

  it("returns 404 when guest does not exist", async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await GET(makeReq("GET"), idParams);
    expect(res.status).toBe(404);
  });

  it("returns 200 with guest including bookings and invoices", async () => {
    mockFindUnique.mockResolvedValueOnce(mockGuest);
    const res = await GET(makeReq("GET"), idParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.guest.id).toBe("g1");
  });

  it("includes bookings and invoices in the prisma include", async () => {
    mockFindUnique.mockResolvedValueOnce(mockGuest);
    await GET(makeReq("GET"), idParams);
    expect(mockFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({ bookings: expect.any(Object), invoices: expect.any(Object) }),
      })
    );
  });
});

describe("PATCH /api/admin/guests/[id]", () => {
  beforeEach(() => { mockUpdate.mockReset(); mockUpdate.mockResolvedValue({ id: "g1" }); mockAuditCreate.mockReset(); });

  it("updates basic guest fields", async () => {
    const res = await PATCH(makeReq("PATCH", { firstName: "Rohit", lastName: "Sharma" }), idParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("updates only notes (partial update)", async () => {
    const res = await PATCH(makeReq("PATCH", { notes: "Prefers vegetarian meals" }), idParams);
    expect(res.status).toBe(200);
  });

  it("accepts null email to clear it", async () => {
    const res = await PATCH(makeReq("PATCH", { email: null }), idParams);
    expect(res.status).toBe(200);
  });

  it("rejects invalid email format", async () => {
    const res = await PATCH(makeReq("PATCH", { email: "not-an-email" }), idParams);
    expect(res.status).toBe(400);
  });

  it("rejects empty firstName", async () => {
    const res = await PATCH(makeReq("PATCH", { firstName: "" }), idParams);
    expect(res.status).toBe(400);
  });

  it("rejects too-short phone", async () => {
    const res = await PATCH(makeReq("PATCH", { phone: "12345" }), idParams);
    expect(res.status).toBe(400);
  });

  it("writes an audit log entry on successful update", async () => {
    await PATCH(makeReq("PATCH", { firstName: "Rohit" }), idParams);
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "update_guest", entityType: "guest", entityId: "g1" }),
      })
    );
  });

  it("returns 404 when guest does not exist", async () => {
    mockUpdate.mockRejectedValueOnce(new Error("Not found"));
    const res = await PATCH(makeReq("PATCH", { firstName: "Test" }), idParams);
    expect(res.status).toBe(404);
  });

  it("returns 401 without auth", async () => {
    const { verifyAdminToken } = await import("@/lib/admin-auth");
    vi.mocked(verifyAdminToken).mockResolvedValueOnce(null as never);
    const res = await PATCH(makeReq("PATCH", { firstName: "X" }), idParams);
    expect(res.status).toBe(401);
  });
});
