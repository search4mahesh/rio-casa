import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Demoting or deactivating the last active owner locks the property out of
 * Setup → Hotel & Staff permanently: only an owner can promote anyone, and
 * there is no password reset or account recovery to climb back in with.
 *
 * It became reachable in one click the moment a revoked session started
 * failing on the next request (B-60) rather than at token expiry.
 */

vi.mock("@/lib/api-auth", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    staff: { findUnique: vi.fn(), count: vi.fn(), update: vi.fn() },
  },
}));

import { PATCH } from "@/app/api/admin/staff/[id]/route";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";

const db = (prisma as unknown as {
  staff: {
    findUnique: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
}).staff;

const params = Promise.resolve({ id: "owner_1" });

function req(body: unknown) {
  return new NextRequest("http://localhost/api/admin/staff/owner_1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/admin/staff/[id] — last-owner guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRole).mockResolvedValue({
      ok: true,
      staff: { staffId: "owner_1", name: "Asha", email: "a@a.com", role: "owner" },
    } as never);
    db.findUnique.mockResolvedValue({ id: "owner_1", role: "owner", isActive: true });
    db.update.mockResolvedValue({
      id: "owner_1", name: "Asha", email: "a@a.com", role: "owner", isActive: true,
    });
  });

  it("refuses to deactivate the only active owner", async () => {
    db.count.mockResolvedValue(0);

    const res = await PATCH(req({ isActive: false }), { params });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/only active owner/i);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("refuses to demote the only active owner", async () => {
    db.count.mockResolvedValue(0);

    const res = await PATCH(req({ role: "manager" }), { params });

    expect(res.status).toBe(400);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("allows deactivating an owner when another active owner remains", async () => {
    db.count.mockResolvedValue(1);

    const res = await PATCH(req({ isActive: false }), { params });

    expect(res.status).toBe(200);
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it("allows demoting an owner when another active owner remains", async () => {
    db.count.mockResolvedValue(1);

    const res = await PATCH(req({ role: "frontdesk" }), { params });

    expect(res.status).toBe(200);
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it("does not count the account being changed as its own replacement", async () => {
    db.count.mockResolvedValue(0);
    await PATCH(req({ isActive: false }), { params });

    expect(db.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { not: "owner_1" } }),
      })
    );
  });

  it("leaves non-owners alone — no count query for a manager", async () => {
    db.findUnique.mockResolvedValue({ id: "owner_1", role: "manager", isActive: true });

    const res = await PATCH(req({ isActive: false }), { params });

    expect(res.status).toBe(200);
    expect(db.count).not.toHaveBeenCalled();
  });

  it("does not block an edit that leaves owner status intact", async () => {
    const res = await PATCH(req({ name: "Asha Patil" }), { params });

    expect(res.status).toBe(200);
    expect(db.count).not.toHaveBeenCalled();
  });

  it("404s for a staff member that does not exist", async () => {
    db.findUnique.mockResolvedValue(null);

    const res = await PATCH(req({ isActive: false }), { params });

    expect(res.status).toBe(404);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("returns the gate's own response to a non-owner", async () => {
    const { forbidden } = await import("@/lib/rbac");
    vi.mocked(requireRole).mockResolvedValue({ ok: false, response: forbidden("owner") } as never);

    const res = await PATCH(req({ isActive: false }), { params });

    expect(res.status).toBe(403);
    expect(db.findUnique).not.toHaveBeenCalled();
  });
});
