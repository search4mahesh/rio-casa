import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockFindMany, mockCreate, mockUpdate, mockDelete } = vi.hoisted(() => ({
  mockFindMany: vi.fn().mockResolvedValue([]),
  mockCreate: vi.fn().mockResolvedValue({ id: "rp1" }),
  mockUpdate: vi.fn().mockResolvedValue({ id: "rp1" }),
  mockDelete: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/admin-auth", () => ({
  verifyAdminToken: vi.fn().mockResolvedValue({ staffId: "s1", role: "owner", name: "Admin", email: "a@a.com" }),
  resolveActiveStaff: vi.fn().mockResolvedValue({ staffId: "s1", role: "owner", name: "Admin", email: "a@a.com" }),
  ADMIN_COOKIE: "admin_token",
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ratePlan: { findMany: mockFindMany, create: mockCreate, update: mockUpdate, delete: mockDelete },
  },
}));

import { GET, POST } from "@/app/api/admin/rate-plans/route";
import { PATCH, DELETE } from "@/app/api/admin/rate-plans/[id]/route";

function makeReq(method: string, body?: object) {
  const init: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body) init.body = JSON.stringify(body);
  const req = new NextRequest("http://localhost/api/admin/rate-plans", init);
  req.cookies.set("admin_token", "mock_token");
  return req;
}

const idParams = { params: Promise.resolve({ id: "rp1" }) };

const validPlan = {
  name: "Peak Season 2026", roomType: "all",
  baseRate: 7500, validFrom: "2026-10-15", validTo: "2027-01-15",
  weekendMarkup: 20, minNights: 2, priority: 1, isActive: true,
};

describe("GET /api/admin/rate-plans", () => {
  it("returns 200 with plans list", async () => {
    mockFindMany.mockResolvedValueOnce([{ id: "rp1", name: "Peak", isActive: true }]);
    const res = await GET(makeReq("GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  it("returns 401 without auth", async () => {
    const { resolveActiveStaff } = await import("@/lib/admin-auth");
    vi.mocked(resolveActiveStaff).mockResolvedValueOnce(null as never);
    const res = await GET(makeReq("GET"));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/admin/rate-plans — Zod validation", () => {
  beforeEach(() => { mockCreate.mockReset(); mockCreate.mockResolvedValue({ id: "rp1" }); });

  it("creates a rate plan with valid data", async () => {
    const res = await POST(makeReq("POST", validPlan));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("rejects invalid roomType", async () => {
    const res = await POST(makeReq("POST", { ...validPlan, roomType: "suite" }));
    expect(res.status).toBe(400);
  });

  it("rejects zero baseRate", async () => {
    const res = await POST(makeReq("POST", { ...validPlan, baseRate: 0 }));
    expect(res.status).toBe(400);
  });

  it("rejects negative baseRate", async () => {
    const res = await POST(makeReq("POST", { ...validPlan, baseRate: -100 }));
    expect(res.status).toBe(400);
  });

  it("rejects invalid date format", async () => {
    const res = await POST(makeReq("POST", { ...validPlan, validFrom: "15-10-2026" }));
    expect(res.status).toBe(400);
  });

  it("rejects validTo before validFrom", async () => {
    const res = await POST(makeReq("POST", { ...validPlan, validFrom: "2026-12-01", validTo: "2026-11-01" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/after/i);
  });

  it("rejects missing name", async () => {
    const { name: _, ...noName } = validPlan;
    const res = await POST(makeReq("POST", noName));
    expect(res.status).toBe(400);
  });

  it("returns 401 without auth", async () => {
    const { resolveActiveStaff } = await import("@/lib/admin-auth");
    vi.mocked(resolveActiveStaff).mockResolvedValueOnce(null as never);
    const res = await POST(makeReq("POST", validPlan));
    expect(res.status).toBe(401);
  });
});

describe("PATCH /api/admin/rate-plans/[id]", () => {
  beforeEach(() => { mockUpdate.mockReset(); mockUpdate.mockResolvedValue({ id: "rp1" }); });

  it("updates isActive toggle", async () => {
    const res = await PATCH(makeReq("PATCH", { isActive: false }), idParams);
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it("updates only specified fields (partial update)", async () => {
    const res = await PATCH(makeReq("PATCH", { baseRate: 8000, weekendMarkup: 25 }), idParams);
    expect(res.status).toBe(200);
  });

  it("returns 400 for invalid weekendMarkup > 100", async () => {
    const res = await PATCH(makeReq("PATCH", { weekendMarkup: 150 }), idParams);
    expect(res.status).toBe(400);
  });

  it("returns 404 when plan does not exist", async () => {
    mockUpdate.mockRejectedValueOnce(new Error("Record not found"));
    const res = await PATCH(makeReq("PATCH", { isActive: false }), idParams);
    expect(res.status).toBe(404);
  });

  it("returns 401 without auth", async () => {
    const { resolveActiveStaff } = await import("@/lib/admin-auth");
    vi.mocked(resolveActiveStaff).mockResolvedValueOnce(null as never);
    const res = await PATCH(makeReq("PATCH", { isActive: false }), idParams);
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/admin/rate-plans/[id]", () => {
  beforeEach(() => { mockDelete.mockReset(); mockDelete.mockResolvedValue({}); });

  it("deletes a plan and returns success", async () => {
    const res = await DELETE(makeReq("DELETE"), idParams);
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it("returns 404 when plan does not exist", async () => {
    mockDelete.mockRejectedValueOnce(new Error("Not found"));
    const res = await DELETE(makeReq("DELETE"), idParams);
    expect(res.status).toBe(404);
  });
});
