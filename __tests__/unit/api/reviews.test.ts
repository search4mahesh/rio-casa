import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockFindMany, mockCount, mockAggregate, mockCreate, mockUpdate, mockDelete } = vi.hoisted(() => ({
  mockFindMany: vi.fn().mockResolvedValue([]),
  mockCount: vi.fn().mockResolvedValue(0),
  mockAggregate: vi.fn().mockResolvedValue({ _avg: { rating: null } }),
  mockCreate: vi.fn().mockResolvedValue({ id: "r1" }),
  mockUpdate: vi.fn().mockResolvedValue({ id: "r1" }),
  mockDelete: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/admin-auth", () => ({
  verifyAdminToken: vi.fn().mockResolvedValue({ staffId: "s1", role: "owner", name: "Admin", email: "a@a.com" }),
  ADMIN_COOKIE: "admin_token",
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    reviewLog: {
      findMany: mockFindMany, count: mockCount, aggregate: mockAggregate,
      create: mockCreate, update: mockUpdate, delete: mockDelete,
    },
  },
}));

import { GET, POST } from "@/app/api/admin/reviews/route";
import { PATCH, DELETE } from "@/app/api/admin/reviews/[id]/route";

function makeReq(method: string, body?: object, queryStr = "") {
  const init: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body) init.body = JSON.stringify(body);
  const req = new NextRequest(`http://localhost/api/admin/reviews${queryStr}`, init);
  req.cookies.set("admin_token", "mock_token");
  return req;
}

const idParams = { params: Promise.resolve({ id: "r1" }) };

const validReview = {
  platform: "google", guestName: "Ravi Kumar", rating: 5,
  reviewText: "Excellent stay! Lovely views.",
  reviewUrl: "https://maps.google.com/example",
  datePosted: "2026-05-15", notes: "Mentioned views",
};

describe("GET /api/admin/reviews", () => {
  beforeEach(() => {
    mockFindMany.mockReset(); mockFindMany.mockResolvedValue([]);
    mockCount.mockReset(); mockCount.mockResolvedValue(0);
    mockAggregate.mockReset(); mockAggregate.mockResolvedValue({ _avg: { rating: null } });
  });

  it("returns 401 without auth", async () => {
    const { verifyAdminToken } = await import("@/lib/admin-auth");
    vi.mocked(verifyAdminToken).mockResolvedValueOnce(null as never);
    const res = await GET(makeReq("GET"));
    expect(res.status).toBe(401);
  });

  it("returns reviews + KPI", async () => {
    mockFindMany.mockResolvedValueOnce([{ id: "r1", rating: 5, platform: "google", guestName: "Test", reviewText: "Great", datePosted: new Date(), responded: false }]);
    mockCount.mockResolvedValueOnce(10).mockResolvedValueOnce(6);
    mockAggregate.mockResolvedValueOnce({ _avg: { rating: 4.5 } });
    const res = await GET(makeReq("GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.kpi.total).toBe(10);
    expect(body.data.kpi.avgRating).toBe(4.5);
    expect(body.data.kpi.respondedPct).toBe(60);
  });

  it("returns avgRating: 0 when there are no reviews", async () => {
    const res = await GET(makeReq("GET"));
    const body = await res.json();
    expect(body.data.kpi.avgRating).toBe(0);
    expect(body.data.kpi.respondedPct).toBe(0);
  });

  it("filters by platform", async () => {
    await GET(makeReq("GET", undefined, "?platform=google"));
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ platform: "google" }) })
    );
  });

  it("filters by responded=false", async () => {
    await GET(makeReq("GET", undefined, "?responded=false"));
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ responded: false }) })
    );
  });

  it("filters by rating range", async () => {
    await GET(makeReq("GET", undefined, "?minRating=4&maxRating=5"));
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ rating: { gte: 4, lte: 5 } }) })
    );
  });
});

describe("POST /api/admin/reviews", () => {
  beforeEach(() => { mockCreate.mockReset(); mockCreate.mockResolvedValue({ id: "new" }); });

  it("creates a review with valid input", async () => {
    const res = await POST(makeReq("POST", validReview));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("rejects invalid platform", async () => {
    const res = await POST(makeReq("POST", { ...validReview, platform: "yelp" }));
    expect(res.status).toBe(400);
  });

  it("rejects rating < 1", async () => {
    const res = await POST(makeReq("POST", { ...validReview, rating: 0 }));
    expect(res.status).toBe(400);
  });

  it("rejects rating > 5", async () => {
    const res = await POST(makeReq("POST", { ...validReview, rating: 6 }));
    expect(res.status).toBe(400);
  });

  it("rejects empty reviewText", async () => {
    const res = await POST(makeReq("POST", { ...validReview, reviewText: "" }));
    expect(res.status).toBe(400);
  });

  it("rejects invalid date format", async () => {
    const res = await POST(makeReq("POST", { ...validReview, datePosted: "15-05-2026" }));
    expect(res.status).toBe(400);
  });

  it("rejects invalid URL", async () => {
    const res = await POST(makeReq("POST", { ...validReview, reviewUrl: "not-a-url" }));
    expect(res.status).toBe(400);
  });

  it("accepts null reviewUrl", async () => {
    const res = await POST(makeReq("POST", { ...validReview, reviewUrl: null }));
    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/admin/reviews/[id]", () => {
  beforeEach(() => { mockUpdate.mockReset(); mockUpdate.mockResolvedValue({ id: "r1" }); });

  it("marks a review as responded and sets respondedAt", async () => {
    const res = await PATCH(makeReq("PATCH", { responded: true }), idParams);
    expect(res.status).toBe(200);
    const callArgs = mockUpdate.mock.calls[0][0];
    expect(callArgs.data.responded).toBe(true);
    expect(callArgs.data.respondedAt).toBeInstanceOf(Date);
  });

  it("clearing responded sets respondedAt to null", async () => {
    await PATCH(makeReq("PATCH", { responded: false }), idParams);
    const callArgs = mockUpdate.mock.calls[0][0];
    expect(callArgs.data.respondedAt).toBeNull();
  });

  it("returns 404 when review does not exist", async () => {
    mockUpdate.mockRejectedValueOnce(new Error("Not found"));
    const res = await PATCH(makeReq("PATCH", { responded: true }), idParams);
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid rating", async () => {
    const res = await PATCH(makeReq("PATCH", { rating: 10 }), idParams);
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/admin/reviews/[id]", () => {
  beforeEach(() => { mockDelete.mockReset(); });

  it("deletes a review and returns success", async () => {
    mockDelete.mockResolvedValueOnce({});
    const res = await DELETE(makeReq("DELETE"), idParams);
    expect(res.status).toBe(200);
  });

  it("returns 404 when review does not exist", async () => {
    mockDelete.mockRejectedValueOnce(new Error("Not found"));
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
