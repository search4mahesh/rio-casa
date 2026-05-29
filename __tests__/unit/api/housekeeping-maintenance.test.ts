import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockFindMany, mockCount, mockUpdate, mockCreate } = vi.hoisted(() => ({
  mockFindMany: vi.fn().mockResolvedValue([]),
  mockCount: vi.fn().mockResolvedValue(0),
  mockUpdate: vi.fn().mockResolvedValue({ id: "t1", status: "completed", maintenanceFlag: false }),
  mockCreate: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/admin-auth", () => ({
  verifyAdminToken: vi.fn().mockResolvedValue({ staffId: "s1", role: "owner", name: "Admin", email: "a@a.com" }),
  ADMIN_COOKIE: "admin_token",
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    housekeepingLog: {
      findMany: mockFindMany,
      count: mockCount,
      create: mockCreate,
      update: mockUpdate,
    },
  },
}));

import { GET, POST } from "@/app/api/admin/housekeeping/route";
import { PATCH } from "@/app/api/admin/housekeeping/[id]/route";

function makeGetReq(params?: Record<string, string>) {
  const url = new URL("http://localhost/api/admin/housekeeping");
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const req = new NextRequest(url.toString(), { method: "GET" });
  req.cookies.set("admin_token", "mock_token");
  return req;
}

function makePatchReq(body: object) {
  const req = new NextRequest("http://localhost/api/admin/housekeeping/t1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  req.cookies.set("admin_token", "mock_token");
  return req;
}

function makePostReq(body: object) {
  const req = new NextRequest("http://localhost/api/admin/housekeeping", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  req.cookies.set("admin_token", "mock_token");
  return req;
}

const maintenanceTask = {
  id: "t1", taskType: "maintenance", status: "pending", maintenanceFlag: true,
  notes: "AC not working", room: { name: "Deluxe Room", roomNumber: "101", floor: 1 },
  createdAt: new Date().toISOString(),
};

const idParams = { params: Promise.resolve({ id: "t1" }) };

describe("GET /api/admin/housekeeping — ?maintenanceCount=true", () => {
  beforeEach(() => { mockCount.mockReset(); });

  it("returns a numeric count without a task list", async () => {
    mockCount.mockResolvedValueOnce(5);
    const res = await GET(makeGetReq({ maintenanceCount: "true" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.count).toBe(5);
    expect(body).not.toHaveProperty("tasks");
  });

  it("returns 0 when there are no open maintenance issues", async () => {
    mockCount.mockResolvedValueOnce(0);
    const res = await GET(makeGetReq({ maintenanceCount: "true" }));
    expect((await res.json()).count).toBe(0);
  });

  it("calls prisma.count — not findMany — for the count query", async () => {
    mockCount.mockResolvedValueOnce(2);
    await GET(makeGetReq({ maintenanceCount: "true" }));
    expect(mockCount).toHaveBeenCalledTimes(1);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("returns 401 without auth", async () => {
    const { verifyAdminToken } = await import("@/lib/admin-auth");
    vi.mocked(verifyAdminToken).mockResolvedValueOnce(null as never);
    const res = await GET(makeGetReq({ maintenanceCount: "true" }));
    expect(res.status).toBe(401);
  });
});

describe("GET /api/admin/housekeeping — ?maintenance=true", () => {
  beforeEach(() => { mockFindMany.mockReset(); mockFindMany.mockResolvedValue([]); });

  it("returns only open maintenance-flagged tasks", async () => {
    mockFindMany.mockResolvedValueOnce([maintenanceTask]);
    const res = await GET(makeGetReq({ maintenance: "true" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.tasks).toHaveLength(1);
    expect(body.tasks[0].maintenanceFlag).toBe(true);
  });

  it("queries with maintenanceFlag:true filter", async () => {
    mockFindMany.mockResolvedValueOnce([]);
    await GET(makeGetReq({ maintenance: "true" }));
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ maintenanceFlag: true }),
      })
    );
  });

  it("returns empty list when all maintenance issues are resolved", async () => {
    mockFindMany.mockResolvedValueOnce([]);
    const res = await GET(makeGetReq({ maintenance: "true" }));
    expect((await res.json()).tasks).toHaveLength(0);
  });
});

describe("GET /api/admin/housekeeping — regular status filter", () => {
  beforeEach(() => { mockFindMany.mockReset(); mockFindMany.mockResolvedValue([]); });

  it("filters by status when ?status=pending is provided", async () => {
    await GET(makeGetReq({ status: "pending" }));
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "pending" }),
      })
    );
  });

  it("returns all tasks with no status filter (status=all)", async () => {
    await GET(makeGetReq({ status: "all" }));
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} })
    );
  });
});

describe("PATCH /api/admin/housekeeping/[id] — maintenance flag", () => {
  beforeEach(() => { mockUpdate.mockReset(); });

  it("resolves a maintenance issue by marking completed and clearing the flag", async () => {
    mockUpdate.mockResolvedValueOnce({
      id: "t1", status: "completed", maintenanceFlag: false,
      room: { name: "Room 101", roomNumber: "101" },
    });
    const res = await PATCH(makePatchReq({ status: "completed", maintenanceFlag: false }), idParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("can flag a task for maintenance attention (maintenanceFlag: true)", async () => {
    mockUpdate.mockResolvedValueOnce({
      id: "t1", status: "pending", maintenanceFlag: true,
      room: { name: "Room 101", roomNumber: "101" },
    });
    const res = await PATCH(makePatchReq({ maintenanceFlag: true }), idParams);
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it("returns 400 for an invalid status value", async () => {
    const res = await PATCH(makePatchReq({ status: "resolved" }), idParams);
    expect(res.status).toBe(400);
  });

  it("returns 401 without auth", async () => {
    const { verifyAdminToken } = await import("@/lib/admin-auth");
    vi.mocked(verifyAdminToken).mockResolvedValueOnce(null as never);
    const res = await PATCH(makePatchReq({ status: "completed" }), idParams);
    expect(res.status).toBe(401);
  });
});

describe("POST /api/admin/housekeeping — taskType validation", () => {
  beforeEach(() => { mockCreate.mockReset(); mockCreate.mockResolvedValue({ id: "new_t", room: { name: "R", roomNumber: "1" } }); });

  it("returns 400 when roomId is missing", async () => {
    const res = await POST(makePostReq({ taskType: "cleaning" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for an unrecognised taskType", async () => {
    const res = await POST(makePostReq({ roomId: "r1", taskType: "polishing" }));
    expect(res.status).toBe(400);
  });

  it("creates a task for all valid taskTypes", async () => {
    for (const taskType of ["cleaning", "inspection", "maintenance", "turndown", "laundry"]) {
      const res = await POST(makePostReq({ roomId: "r1", taskType }));
      expect(res.status).toBe(200);
    }
  });
});
