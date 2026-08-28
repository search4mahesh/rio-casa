import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockFindMany, mockCreateMany, mockDelete, mockFindUnique, mockAuditCreate } = vi.hoisted(() => ({
  mockFindMany: vi.fn().mockResolvedValue([]),
  mockCreateMany: vi.fn().mockResolvedValue({ count: 3 }),
  mockDelete: vi.fn().mockResolvedValue({}),
  mockFindUnique: vi.fn().mockResolvedValue({
    id: "bd_123", roomId: "r1", blockDate: new Date("2026-12-25T00:00:00.000Z"),
    reason: "Christmas", blockedBy: "Admin", createdAt: new Date(),
  }),
  mockAuditCreate: vi.fn().mockResolvedValue({}),
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
      findUnique: mockFindUnique,
    },
    auditLog: { create: mockAuditCreate },
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
  beforeEach(() => {
    mockCreateMany.mockReset();
    mockCreateMany.mockResolvedValue({ count: 0 });
    mockAuditCreate.mockClear();
  });

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

  // Blocking is the one write that removes inventory without leaving a booking
  // behind, which makes it the cheapest way to take a room off the calendar and
  // sell it privately. Front desk reads the list (GET) but may not write it.
  it("rejects front desk with 403", async () => {
    const { resolveActiveStaff } = await import("@/lib/admin-auth");
    vi.mocked(resolveActiveStaff).mockResolvedValueOnce(
      { staffId: "s2", role: "frontdesk", name: "Desk", email: "d@r.in" } as never
    );
    const res = await POST(makeReq("POST", validBody));
    expect(res.status).toBe(403);
    expect(mockCreateMany).not.toHaveBeenCalled();
  });

  it("stamps every row with who blocked it", async () => {
    mockCreateMany.mockResolvedValueOnce({ count: 3 });
    await POST(makeReq("POST", validBody));

    const rows = mockCreateMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(3);
    expect(rows.every((r: { blockedBy: string }) => r.blockedBy === "Admin")).toBe(true);
  });

  it("writes one audit row for the range, counting what was actually added", async () => {
    // `skipDuplicates` means a re-block over an existing one adds fewer rows
    // than days requested (B-10); the log records the change, not the request.
    mockCreateMany.mockResolvedValueOnce({ count: 1 });
    await POST(makeReq("POST", validBody));

    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    const { data } = mockAuditCreate.mock.calls[0][0];
    expect(data.action).toBe("blocked_dates_created");
    expect(data.userId).toBe("s1");
    expect(data.entityId).toBe("all");
    expect(data.newValue).toMatchObject({
      startDate: "2026-12-20", endDate: "2026-12-22", daysBlocked: 1,
    });
  });

  it("audits a room-specific block against that room", async () => {
    mockCreateMany.mockResolvedValueOnce({ count: 3 });
    await POST(makeReq("POST", { ...validBody, roomId: "room_deluxe" }));
    expect(mockAuditCreate.mock.calls[0][0].data.entityId).toBe("room_deluxe");
  });
});

describe("DELETE /api/admin/blocked-dates/[id]", () => {
  beforeEach(() => {
    mockDelete.mockReset();
    mockAuditCreate.mockClear();
    // The route reads the row before deleting it, so the audit entry can say
    // what was removed. Default to a row existing; the 404 cases override it.
    mockFindUnique.mockReset();
    mockFindUnique.mockResolvedValue({
      id: "bd_123", roomId: "r1", blockDate: new Date("2026-12-25T00:00:00.000Z"),
      reason: "Christmas", blockedBy: "Admin", createdAt: new Date(),
    });
  });

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

  it("returns 404 without deleting when the row is already gone", async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await DELETE(makeReq("DELETE"), idParams);
    expect(res.status).toBe(404);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  // Unblocking puts inventory back on sale. Recording what was removed — and
  // who had blocked it — is the only trace left once the row is gone.
  it("audits the removal with the contents of the deleted row", async () => {
    mockDelete.mockResolvedValueOnce({ id: "bd_123" });
    await DELETE(makeReq("DELETE"), idParams);

    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    const { data } = mockAuditCreate.mock.calls[0][0];
    expect(data.action).toBe("blocked_date_removed");
    expect(data.userId).toBe("s1");
    expect(data.entityId).toBe("r1");
    expect(data.oldValue).toMatchObject({ blockDate: "2026-12-25", blockedBy: "Admin" });
  });

  it("does not audit a removal that never happened", async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    await DELETE(makeReq("DELETE"), idParams);
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });

  it("returns 401 without auth", async () => {
    const { resolveActiveStaff } = await import("@/lib/admin-auth");
    vi.mocked(resolveActiveStaff).mockResolvedValueOnce(null as never);
    const res = await DELETE(makeReq("DELETE"), idParams);
    expect(res.status).toBe(401);
  });
});
