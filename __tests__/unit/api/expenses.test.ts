import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock auth to always pass
vi.mock("@/lib/admin-auth", () => ({
  verifyAdminToken: vi.fn().mockResolvedValue({ staffId: "s1", role: "owner", name: "Test", email: "t@t.com" }),
  ADMIN_COOKIE: "admin_token",
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    expense: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: "exp_1", amount: 500 }),
    },
  },
}));

import { GET, POST } from "@/app/api/admin/expenses/route";

function makeReq(method: string, body?: object) {
  const url = "http://localhost/api/admin/expenses";
  const init: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body) init.body = JSON.stringify(body);
  const req = new NextRequest(url, init);
  req.cookies.set("admin_token", "mock_token");
  return req;
}

const validExpense = {
  date: "2026-05-28",
  category: "food",
  description: "Groceries for kitchen",
  amount: 1500,
  paymentMethod: "cash",
  recordedBy: "Ravi Kumar",
};

describe("GET /api/admin/expenses", () => {
  it("returns 200 with expenses list", async () => {
    const res = await GET(makeReq("GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("expenses");
    expect(body.data).toHaveProperty("total");
  });
});

describe("POST /api/admin/expenses — Zod validation", () => {
  it("creates expense with valid data", async () => {
    const res = await POST(makeReq("POST", validExpense));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("rejects an invalid category", async () => {
    const res = await POST(makeReq("POST", { ...validExpense, category: "snacks" }));
    expect(res.status).toBe(400);
  });

  it("rejects a negative amount", async () => {
    const res = await POST(makeReq("POST", { ...validExpense, amount: -100 }));
    expect(res.status).toBe(400);
  });

  it("rejects zero amount", async () => {
    const res = await POST(makeReq("POST", { ...validExpense, amount: 0 }));
    expect(res.status).toBe(400);
  });

  it("rejects missing description", async () => {
    const { description: _, ...noDesc } = validExpense;
    const res = await POST(makeReq("POST", noDesc));
    expect(res.status).toBe(400);
  });

  it("rejects invalid date format", async () => {
    const res = await POST(makeReq("POST", { ...validExpense, date: "28-05-2026" }));
    expect(res.status).toBe(400);
  });

  it("rejects invalid payment method", async () => {
    const res = await POST(makeReq("POST", { ...validExpense, paymentMethod: "bitcoin" }));
    expect(res.status).toBe(400);
  });
});
