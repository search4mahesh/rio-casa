import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";

const mockStaff = {
  id: "staff_001",
  name: "Ravi Kumar",
  email: "ravi@riocasa.in",
  passwordHash: bcrypt.hashSync("correct_password", 10),
  role: "manager",
  isActive: true,
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    staff: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

import { POST } from "@/app/api/admin/auth/login/route";
import { prisma } from "@/lib/prisma";

const mockPrismaStaff = (prisma as { staff: { findUnique: ReturnType<typeof vi.fn> } }).staff;

function loginReq(body: object) {
  return new NextRequest("http://localhost/api/admin/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/auth/login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrismaStaff.findUnique.mockResolvedValue(mockStaff);
  });

  it("returns 200 and sets JWT cookie on correct credentials", async () => {
    const res = await POST(loginReq({ email: "ravi@riocasa.in", password: "correct_password" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.staff.email).toBe("ravi@riocasa.in");
    expect(res.headers.get("set-cookie")).toMatch(/admin_token/);
  });

  it("returns 401 for wrong password", async () => {
    const res = await POST(loginReq({ email: "ravi@riocasa.in", password: "wrong_password" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("returns 401 when staff does not exist", async () => {
    mockPrismaStaff.findUnique.mockResolvedValue(null);
    const res = await POST(loginReq({ email: "nobody@riocasa.in", password: "any" }));
    expect(res.status).toBe(401);
  });

  it("returns 401 when staff account is inactive", async () => {
    mockPrismaStaff.findUnique.mockResolvedValue({ ...mockStaff, isActive: false });
    const res = await POST(loginReq({ email: "ravi@riocasa.in", password: "correct_password" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid email format", async () => {
    const res = await POST(loginReq({ email: "not-an-email", password: "pass" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when password is missing", async () => {
    const res = await POST(loginReq({ email: "ravi@riocasa.in" }));
    expect(res.status).toBe(400);
  });
});
