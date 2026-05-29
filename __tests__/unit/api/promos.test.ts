import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockFindMany, mockFindUnique, mockCreate, mockUpdate, mockDelete } = vi.hoisted(() => ({
  mockFindMany: vi.fn().mockResolvedValue([]),
  mockFindUnique: vi.fn().mockResolvedValue(null),
  mockCreate: vi.fn().mockResolvedValue({ id: "p1", code: "SUMMER20" }),
  mockUpdate: vi.fn().mockResolvedValue({ id: "p1" }),
  mockDelete: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/admin-auth", () => ({
  verifyAdminToken: vi.fn().mockResolvedValue({ staffId: "s1", role: "owner", name: "Admin", email: "a@a.com" }),
  ADMIN_COOKIE: "admin_token",
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    promotion: {
      findMany: mockFindMany,
      findUnique: mockFindUnique,
      create: mockCreate,
      update: mockUpdate,
      delete: mockDelete,
    },
  },
}));

import { GET, POST } from "@/app/api/admin/promos/route";
import { PATCH, DELETE } from "@/app/api/admin/promos/[id]/route";

function makeReq(method: string, body?: object) {
  const init: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body) init.body = JSON.stringify(body);
  const req = new NextRequest("http://localhost/api/admin/promos", init);
  req.cookies.set("admin_token", "mock_token");
  return req;
}

const idParams = { params: Promise.resolve({ id: "p1" }) };

const validPromo = {
  code: "SUMMER20",
  discountType: "percentage",
  discountValue: 20,
  validFrom: "2026-06-01",
  validTo: "2026-07-31",
  minNights: 2,
  minAmount: 0,
  isActive: true,
};

describe("GET /api/admin/promos", () => {
  it("returns 200 with promos list", async () => {
    mockFindMany.mockResolvedValueOnce([{ id: "p1", code: "SUMMER20", isActive: true }]);
    const res = await GET(makeReq("GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.promos).toHaveLength(1);
  });

  it("returns 401 without auth", async () => {
    const { verifyAdminToken } = await import("@/lib/admin-auth");
    vi.mocked(verifyAdminToken).mockResolvedValueOnce(null as never);
    const res = await GET(makeReq("GET"));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/admin/promos — Zod validation", () => {
  beforeEach(() => {
    mockFindUnique.mockReset(); mockFindUnique.mockResolvedValue(null);
    mockCreate.mockReset(); mockCreate.mockResolvedValue({ id: "p1", code: "SUMMER20" });
  });

  it("creates promo with valid data", async () => {
    const res = await POST(makeReq("POST", validPromo));
    expect(res.status).toBe(201);
    expect((await res.json()).success).toBe(true);
  });

  it("rejects lowercase code (must be uppercase)", async () => {
    const res = await POST(makeReq("POST", { ...validPromo, code: "summer20" }));
    expect(res.status).toBe(400);
  });

  it("rejects code with spaces", async () => {
    const res = await POST(makeReq("POST", { ...validPromo, code: "SUMMER 20" }));
    expect(res.status).toBe(400);
  });

  it("rejects invalid discountType", async () => {
    const res = await POST(makeReq("POST", { ...validPromo, discountType: "halfprice" }));
    expect(res.status).toBe(400);
  });

  it("rejects zero discountValue", async () => {
    const res = await POST(makeReq("POST", { ...validPromo, discountValue: 0 }));
    expect(res.status).toBe(400);
  });

  it("rejects invalid date format", async () => {
    const res = await POST(makeReq("POST", { ...validPromo, validFrom: "01-06-2026" }));
    expect(res.status).toBe(400);
  });

  it("rejects validTo before validFrom", async () => {
    const res = await POST(makeReq("POST", { ...validPromo, validFrom: "2026-07-01", validTo: "2026-06-01" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/after/i);
  });

  it("returns 409 when code already exists", async () => {
    mockFindUnique.mockResolvedValueOnce({ id: "existing", code: "SUMMER20" });
    const res = await POST(makeReq("POST", validPromo));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already exists/i);
  });

  it("accepts flat discount type", async () => {
    const res = await POST(makeReq("POST", { ...validPromo, code: "FLAT500", discountType: "flat", discountValue: 500 }));
    expect(res.status).toBe(201);
  });

  it("returns 401 without auth", async () => {
    const { verifyAdminToken } = await import("@/lib/admin-auth");
    vi.mocked(verifyAdminToken).mockResolvedValueOnce(null as never);
    const res = await POST(makeReq("POST", validPromo));
    expect(res.status).toBe(401);
  });
});

describe("PATCH /api/admin/promos/[id]", () => {
  beforeEach(() => { mockUpdate.mockReset(); mockUpdate.mockResolvedValue({ id: "p1" }); });

  it("toggles isActive", async () => {
    const res = await PATCH(makeReq("PATCH", { isActive: false }), idParams);
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it("updates discount value", async () => {
    const res = await PATCH(makeReq("PATCH", { discountValue: 30 }), idParams);
    expect(res.status).toBe(200);
  });

  it("returns 400 for invalid discountType in patch", async () => {
    const res = await PATCH(makeReq("PATCH", { discountType: "free" }), idParams);
    expect(res.status).toBe(400);
  });

  it("returns 404 when promo does not exist", async () => {
    mockUpdate.mockRejectedValueOnce(new Error("Not found"));
    const res = await PATCH(makeReq("PATCH", { isActive: false }), idParams);
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/admin/promos/[id]", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockDelete.mockReset(); mockDelete.mockResolvedValue({});
  });

  it("deletes an unused promo code", async () => {
    mockFindUnique.mockResolvedValueOnce({ usedCount: 0 });
    const res = await DELETE(makeReq("DELETE"), idParams);
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it("returns 409 when promo has been used", async () => {
    mockFindUnique.mockResolvedValueOnce({ usedCount: 5 });
    const res = await DELETE(makeReq("DELETE"), idParams);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/used/i);
  });

  it("returns 404 when promo does not exist", async () => {
    mockFindUnique.mockResolvedValueOnce(null);
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
