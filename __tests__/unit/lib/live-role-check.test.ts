import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * B-60 — a session used to carry a 12-hour-old snapshot of the account.
 *
 * `role` and `isActive` were read once at login and signed into the JWT, and
 * nothing looked at the staff row again. Pressing *Deactivate* greyed the row
 * out and showed a success toast while that person kept working until their
 * token expired; an `owner` demoted to `frontdesk` kept owner powers for long
 * enough to promote themselves back.
 *
 * These tests mock the *database*, not the gate, so they fail if anyone
 * reverts `requireRole` to trusting the token's own claims.
 */

const { tokenClaims } = vi.hoisted(() => ({
  tokenClaims: { value: { staffId: "s1", name: "Asha", email: "a@a.com", role: "owner" } as unknown },
}));

vi.mock("jose", () => ({
  SignJWT: class {},
  jwtVerify: vi.fn(async () => ({ payload: tokenClaims.value })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { staff: { findUnique: vi.fn() } },
}));

import { requireRole } from "@/lib/api-auth";
import { resolveActiveStaff } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

const staffRow = (prisma as unknown as { staff: { findUnique: ReturnType<typeof vi.fn> } }).staff;

function req() {
  const r = new NextRequest("http://localhost/api/admin/anything", { method: "GET" });
  r.cookies.set("admin_token", "a.signed.token");
  return r;
}

describe("the session is re-read from the database, not trusted from the token", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The token still claims owner, in every test below. What changes is the row.
    tokenClaims.value = { staffId: "s1", name: "Asha", email: "a@a.com", role: "owner" };
  });

  it("lets an active owner through", async () => {
    staffRow.findUnique.mockResolvedValue({
      id: "s1", name: "Asha", email: "a@a.com", role: "owner", isActive: true,
    });

    const auth = await requireRole(req(), "owner");
    expect(auth.ok).toBe(true);
  });

  it("rejects a deactivated account whose token has not expired", async () => {
    staffRow.findUnique.mockResolvedValue({
      id: "s1", name: "Asha", email: "a@a.com", role: "owner", isActive: false,
    });

    const auth = await requireRole(req(), "housekeeping");
    expect(auth.ok).toBe(false);
    if (!auth.ok) expect(auth.response.status).toBe(401);
  });

  it("rejects an account deleted since the token was issued", async () => {
    staffRow.findUnique.mockResolvedValue(null);

    const auth = await requireRole(req(), "housekeeping");
    expect(auth.ok).toBe(false);
    if (!auth.ok) expect(auth.response.status).toBe(401);
  });

  it("applies a demotion immediately — the column beats the claim", async () => {
    // Token says owner; the row says frontdesk. The row wins, so an
    // owner-gated route must refuse.
    staffRow.findUnique.mockResolvedValue({
      id: "s1", name: "Asha", email: "a@a.com", role: "frontdesk", isActive: true,
    });

    const auth = await requireRole(req(), "owner");
    expect(auth.ok).toBe(false);
    if (!auth.ok) expect(auth.response.status).toBe(403);
  });

  it("applies a promotion immediately too", async () => {
    tokenClaims.value = { staffId: "s1", name: "Asha", email: "a@a.com", role: "housekeeping" };
    staffRow.findUnique.mockResolvedValue({
      id: "s1", name: "Asha", email: "a@a.com", role: "manager", isActive: true,
    });

    const auth = await requireRole(req(), "manager");
    expect(auth.ok).toBe(true);
    if (auth.ok) expect(auth.staff.role).toBe("manager");
  });

  it("hands handlers the row's name and email, so a rename is not stale either", async () => {
    staffRow.findUnique.mockResolvedValue({
      id: "s1", name: "Asha Patil", email: "asha.patil@riocasa.in", role: "owner", isActive: true,
    });

    const auth = await requireRole(req(), "owner");
    expect(auth.ok).toBe(true);
    if (auth.ok) {
      expect(auth.staff.name).toBe("Asha Patil");
      expect(auth.staff.email).toBe("asha.patil@riocasa.in");
    }
  });

  it("does not query at all without a token", async () => {
    const bare = new NextRequest("http://localhost/api/admin/anything", { method: "GET" });

    const auth = await requireRole(bare, "housekeeping");
    expect(auth.ok).toBe(false);
    expect(staffRow.findUnique).not.toHaveBeenCalled();
  });

  it("resolveActiveStaff looks the row up by the token's staffId", async () => {
    staffRow.findUnique.mockResolvedValue({
      id: "s1", name: "Asha", email: "a@a.com", role: "owner", isActive: true,
    });

    await resolveActiveStaff("a.signed.token");

    expect(staffRow.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "s1" } })
    );
  });
});
