import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mutable role the mocked verifyAdminToken will return
const { state } = vi.hoisted(() => ({ state: { role: "owner" as string } }));

vi.mock("@/lib/admin-auth", () => ({
  verifyAdminToken: vi.fn(async () => ({ staffId: "s1", name: "Test", email: "t@t.com", role: state.role })),
  ADMIN_COOKIE: "admin_token",
}));

// Generic prisma mock — every model method returns benign empty data so the
// handler proceeds to (or past) the role gate without DB errors.
vi.mock("@/lib/prisma", () => {
  const model = () => ({
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    findFirst: vi.fn().mockResolvedValue(null),
    count: vi.fn().mockResolvedValue(0),
    aggregate: vi.fn().mockResolvedValue({ _avg: { rating: null } }),
    create: vi.fn().mockResolvedValue({ id: "x" }),
    update: vi.fn().mockResolvedValue({ id: "x" }),
    upsert: vi.fn().mockResolvedValue({ id: "x" }),
    delete: vi.fn().mockResolvedValue({}),
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
  });
  return {
    prisma: {
      booking: model(), guest: model(), invoice: model(), expense: model(),
      ratePlan: model(), promotion: model(), reviewLog: model(), shiftAssignment: model(),
      staff: model(), room: model(), roomStatus: model(), blockedDate: model(),
      housekeepingLog: model(), auditLog: model(), communicationLog: model(),
    },
  };
});

vi.mock("@/lib/booking-service", () => ({
  runNightAudit: vi.fn().mockResolvedValue({ noShows: 0, dueCheckouts: 0, arrivals: 0 }),
}));

import { GET as reportsGET } from "@/app/api/admin/reports/route";
import { GET as expensesGET } from "@/app/api/admin/expenses/route";
import { GET as bookingsGET } from "@/app/api/admin/bookings/route";
import { GET as staffGET } from "@/app/api/admin/staff/route";

function req(path = "http://localhost/api/admin/x") {
  const r = new NextRequest(path, { method: "GET" });
  r.cookies.set("admin_token", "tok");
  return r;
}

function setRole(role: string) { state.role = role; }

describe("RBAC route enforcement — manager-gated route (reports)", () => {
  beforeEach(() => setRole("owner"));

  it("owner → allowed (200)", async () => {
    setRole("owner");
    expect((await reportsGET(req())).status).toBe(200);
  });
  it("manager → allowed (200)", async () => {
    setRole("manager");
    expect((await reportsGET(req())).status).toBe(200);
  });
  it("frontdesk → forbidden (403)", async () => {
    setRole("frontdesk");
    expect((await reportsGET(req())).status).toBe(403);
  });
  it("housekeeping → forbidden (403)", async () => {
    setRole("housekeeping");
    expect((await reportsGET(req())).status).toBe(403);
  });
});

describe("RBAC route enforcement — manager-gated route (expenses)", () => {
  it("manager allowed, frontdesk forbidden", async () => {
    setRole("manager");
    expect((await expensesGET(req())).status).toBe(200);
    setRole("frontdesk");
    expect((await expensesGET(req())).status).toBe(403);
  });
});

describe("RBAC route enforcement — frontdesk-gated route (bookings)", () => {
  it("frontdesk → allowed (200)", async () => {
    setRole("frontdesk");
    expect((await bookingsGET(req())).status).toBe(200);
  });
  it("manager (higher) → allowed (200)", async () => {
    setRole("manager");
    expect((await bookingsGET(req())).status).toBe(200);
  });
  it("housekeeping (lower) → forbidden (403)", async () => {
    setRole("housekeeping");
    expect((await bookingsGET(req())).status).toBe(403);
  });
});

describe("RBAC route enforcement — staff list (manager-gated)", () => {
  it("manager → allowed, housekeeping → forbidden", async () => {
    setRole("manager");
    expect((await staffGET(req())).status).toBe(200);
    setRole("housekeeping");
    expect((await staffGET(req())).status).toBe(403);
  });
});
