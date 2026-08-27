import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockFindMany, mockCreateMany, mockDelete } = vi.hoisted(() => ({
  mockFindMany: vi.fn().mockResolvedValue([]),
  mockCreateMany: vi.fn().mockResolvedValue({ count: 3 }),
  mockDelete: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/admin-auth", () => ({
  verifyAdminToken: vi.fn().mockResolvedValue({ staffId: "s1", role: "owner", name: "Admin", email: "a@a.com" }),
  resolveActiveStaff: vi.fn().mockResolvedValue({ staffId: "s1", role: "owner", name: "Admin", email: "a@a.com" }),
  ADMIN_COOKIE: "admin_token",
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    blockedDate: {
      findMany: mockFindMany,
      createMany: mockCreateMany,
      delete: mockDelete,
    },
  },
}));

import { GET, POST } from "@/app/api/admin/blocked-dates/route";
import { DELETE } from "@/app/api/admin/blocked-dates/[id]/route";

function makeReq(method: string, body?: object, path = "/api/admin/blocked-dates") {
  const init: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body) init.body = JSON.stringify(body);
  const req = new NextRequest(`http://localhost${path}`, init);
  req.cookies.set("admin_token", "mock_token");
  return req;
}

const validBody = { startDate: "2026-12-20", endDate: "2026-12-22", reason: "Christmas closure" };
const idParams = { params: Promise.resolve({ id: "bd_123" }) };

describe("GET /api/admin/blocked-dates", () => {
  beforeEach(() => { mockFindMany.mockReset(); mockFindMany.mockResolvedValue([]); });

  it("returns 200 with a blocked dates list", async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: "bd1", blockDate: new Date("2026-12-25"), reason: "Christmas", room: null, createdAt: new Date() },
    ]);
    const res = await GET(makeReq("GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  it("returns empty array when no dates are blocked", async () => {
    const res = await GET(makeReq("GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });

  it("returns 401 without auth", async () => {
    const { resolveActiveStaff } = await import("@/lib/admin-auth");
    vi.mocked(resolveActiveStaff).mockResolvedValueOnce(null as never);
    const res = await GET(makeReq("GET"));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/admin/blocked-dates", () => {
  beforeEach(() => { mockCreateMany.mockReset(); mockCreateMany.mockResolvedValue({ count: 0 }); });

  it("creates blocked dates for a valid date range and returns count", async () => {
    mockCreateMany.mockResolvedValueOnce({ count: 3 });
    const res = await POST(makeReq("POST", validBody));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBe(3);
  });

  it("returns count of 1 when startDate equals endDate (single day)", async () => {
    mockCreateMany.mockResolvedValueOnce({ count: 1 });
    const res = await POST(makeReq("POST", { startDate: "2026-12-25", endDate: "2026-12-25" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBe(1);
  });

  it("accepts an optional roomId for room-specific blocking", async () => {
    mockCreateMany.mockResolvedValueOnce({ count: 2 });
    const res = await POST(makeReq("POST", { ...validBody, roomId: "room_deluxe" }));
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it("blocks all rooms (roomId: null) when no roomId is provided", async () => {
    mockCreateMany.mockResolvedValueOnce({ count: 3 });
    const res = await POST(makeReq("POST", validBody));
    const body = await res.json();
    expect(body.success).toBe(true);
    const callArgs = mockCreateMany.mock.calls[0][0];
    expect(callArgs.data[0].roomId).toBeNull();
  });

  it("returns 400 when endDate is before startDate", async () => {
    const res = await POST(makeReq("POST", { startDate: "2026-12-25", endDate: "2026-12-20" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/end date/i);
  });

  it("returns 400 for an invalid date format", async () => {
    const res = await POST(makeReq("POST", { startDate: "25-12-2026", endDate: "2026-12-30" }));
    expect(res.status).toBe(400);
    expect((await res.json()).success).toBe(false);
  });

  it("returns 400 when date range exceeds 90 days", async () => {
    const res = await POST(makeReq("POST", { startDate: "2026-01-01", endDate: "2026-12-31" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/90 days/i);
  });

  it("returns 400 when startDate is missing", async () => {
    const res = await POST(makeReq("POST", { endDate: "2026-12-25" }));
    expect(res.status).toBe(400);
  });

  it("returns 401 without auth", async () => {
    const { resolveActiveStaff } = await import("@/lib/admin-auth");
    vi.mocked(resolveActiveStaff).mockResolvedValueOnce(null as never);
    const res = await POST(makeReq("POST", validBody));
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/admin/blocked-dates/[id]", () => {
  beforeEach(() => { mockDelete.mockReset(); });

  it("deletes a blocked date and returns success", async () => {
    mockDelete.mockResolvedValueOnce({ id: "bd_123" });
    const res = await DELETE(makeReq("DELETE"), idParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("returns 404 when prisma throws (record not found)", async () => {
    mockDelete.mockRejectedValueOnce(new Error("Record not found"));
    const res = await DELETE(makeReq("DELETE"), idParams);
    expect(res.status).toBe(404);
    expect((await res.json()).success).toBe(false);
  });

  it("returns 401 without auth", async () => {
    const { resolveActiveStaff } = await import("@/lib/admin-auth");
    vi.mocked(resolveActiveStaff).mockResolvedValueOnce(null as never);
    const res = await DELETE(makeReq("DELETE"), idParams);
    expect(res.status).toBe(401);
  });
});
