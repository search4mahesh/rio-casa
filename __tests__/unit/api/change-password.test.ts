import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";

// The account the session resolves to. `passwordHash` is a real bcrypt hash so
// the route's `bcrypt.compare` is exercised rather than mocked away — the whole
// point of the route is that it refuses a wrong current password.
const mockStaff = {
  id: "staff_001",
  name: "Ravi Kumar",
  passwordHash: bcrypt.hashSync("current_password", 10),
  isActive: true,
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    staff: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  },
}));

vi.mock("@/lib/api-auth", () => ({
  requireAuth: vi.fn(),
}));

import { POST } from "@/app/api/admin/auth/password/route";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";

const db = prisma as unknown as {
  staff: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  auditLog: { create: ReturnType<typeof vi.fn> };
};
const mockRequireAuth = requireAuth as unknown as ReturnType<typeof vi.fn>;

function req(body: unknown) {
  return new NextRequest("http://localhost/api/admin/auth/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/auth/password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({
      ok: true,
      staff: { staffId: "staff_001", name: "Ravi Kumar", email: "ravi@riocasa.in", role: "housekeeping" },
    });
    db.staff.findUnique.mockResolvedValue(mockStaff);
    db.staff.update.mockResolvedValue({});
    db.auditLog.create.mockResolvedValue({});
  });

  it("changes the password when the current one is correct", async () => {
    const res = await POST(req({ currentPassword: "current_password", newPassword: "a-long-new-password" }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toBe("Password changed.");

    expect(db.staff.update).toHaveBeenCalledTimes(1);
    const updateArg = db.staff.update.mock.calls[0][0];
    expect(updateArg.where).toEqual({ id: "staff_001" });
    // The stored value is a hash of the new password, never the password itself.
    expect(updateArg.data.passwordHash).not.toBe("a-long-new-password");
    expect(bcrypt.compareSync("a-long-new-password", updateArg.data.passwordHash)).toBe(true);
  });

  it("rejects a wrong current password with 401 and writes nothing", async () => {
    const res = await POST(req({ currentPassword: "not_it", newPassword: "a-long-new-password" }));

    expect(res.status).toBe(401);
    expect((await res.json()).success).toBe(false);
    expect(db.staff.update).not.toHaveBeenCalled();
  });

  it("refuses a new password shorter than the policy floor", async () => {
    const res = await POST(req({ currentPassword: "current_password", newPassword: "short" }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    // `error` is always a string clients render directly — never a Zod object.
    expect(typeof body.error).toBe("string");
    expect(db.staff.update).not.toHaveBeenCalled();
  });

  it("refuses a new password identical to the current one", async () => {
    const res = await POST(req({ currentPassword: "current_password", newPassword: "current_password" }));

    expect(res.status).toBe(400);
    expect(db.staff.update).not.toHaveBeenCalled();
  });

  // The token carries a 12-hour-old snapshot of the account (B-60). Re-reading
  // the row is what stops a deactivated account resetting its own way back in.
  it("refuses a deactivated account even with a valid session", async () => {
    db.staff.findUnique.mockResolvedValue({ ...mockStaff, isActive: false });

    const res = await POST(req({ currentPassword: "current_password", newPassword: "a-long-new-password" }));

    expect(res.status).toBe(403);
    expect(db.staff.update).not.toHaveBeenCalled();
  });

  it("returns the auth gate's own response when there is no session", async () => {
    const { fail } = await import("@/lib/api-response");
    mockRequireAuth.mockResolvedValue({ ok: false, response: fail("Your session has expired — please sign in again.", 401) });

    const res = await POST(req({ currentPassword: "x", newPassword: "a-long-new-password" }));

    expect(res.status).toBe(401);
    expect(db.staff.findUnique).not.toHaveBeenCalled();
    expect(db.staff.update).not.toHaveBeenCalled();
  });

  it("succeeds even if the audit row fails — the password is already changed", async () => {
    db.auditLog.create.mockRejectedValue(new Error("audit table unavailable"));

    const res = await POST(req({ currentPassword: "current_password", newPassword: "a-long-new-password" }));

    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(db.staff.update).toHaveBeenCalledTimes(1);
  });

  it("never records the password in the audit row", async () => {
    await POST(req({ currentPassword: "current_password", newPassword: "a-long-new-password" }));

    const serialised = JSON.stringify(db.auditLog.create.mock.calls[0][0]);
    expect(serialised).not.toContain("a-long-new-password");
    expect(serialised).not.toContain("current_password");
  });

  it("returns 400 on a body that is not JSON", async () => {
    const bad = new NextRequest("http://localhost/api/admin/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });

    const res = await POST(bad);
    expect(res.status).toBe(400);
    expect(db.staff.update).not.toHaveBeenCalled();
  });
});
