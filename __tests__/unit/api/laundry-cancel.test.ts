/**
 * B-11 — "cancel a batch entered by mistake" hard-deleted the row.
 *
 * The cascade took the item lines with it, so the record of what physically
 * went to the laundryman was gone; the `cancelled` status the PATCH guards
 * against was unreachable; and the audit row pointed at an `entityId` that no
 * longer existed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  del: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  requireRole: vi.fn().mockResolvedValue({
    ok: true,
    staff: { staffId: "s1", role: "manager", name: "Manager", email: "m@r.in" },
  }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    laundryBatch: { findUnique: h.findUnique, update: h.update, delete: h.del },
    laundryBatchItem: { update: vi.fn(), findMany: vi.fn() },
    auditLog: { create: h.auditCreate },
    $transaction: vi.fn(),
  },
}));

import { DELETE } from "@/app/api/admin/laundry/[id]/route";

const params = { id: "lb1" };
const request = () => new NextRequest("http://localhost/api/admin/laundry/lb1", { method: "DELETE" });

function batch(status: string) {
  return { id: "lb1", batchNumber: "LB-20260815-01", status, totalPieces: 40 };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.update.mockResolvedValue({});
  h.auditCreate.mockResolvedValue({});
});

describe("DELETE /api/admin/laundry/[id]", () => {
  it("marks the batch cancelled instead of deleting it", async () => {
    h.findUnique.mockResolvedValue(batch("sent"));

    const res = await DELETE(request(), { params });
    expect(res.status).toBe(200);

    expect(h.del).not.toHaveBeenCalled();
    expect(h.update).toHaveBeenCalledWith({
      where: { id: "lb1" },
      data: { status: "cancelled" },
    });
  });

  it("leaves an audit trail that still points at a row that exists", async () => {
    h.findUnique.mockResolvedValue(batch("sent"));
    await DELETE(request(), { params });

    expect(h.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "laundry_batch_cancelled",
          entityId: "lb1",
        }),
      })
    );
  });

  it("refuses to cancel a batch that has already been returned", async () => {
    // The linen is back on the shelf — cancelling would drop a real event.
    h.findUnique.mockResolvedValue(batch("returned"));

    const res = await DELETE(request(), { params });
    expect(res.status).toBe(409);
    expect(h.update).not.toHaveBeenCalled();
  });

  it("refuses to cancel a partially returned batch", async () => {
    h.findUnique.mockResolvedValue(batch("partial"));

    const res = await DELETE(request(), { params });
    expect(res.status).toBe(409);
    expect(h.update).not.toHaveBeenCalled();
  });

  it("is not silently repeatable", async () => {
    h.findUnique.mockResolvedValue(batch("cancelled"));

    const res = await DELETE(request(), { params });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already cancelled/i);
  });

  it("404s for a batch that does not exist", async () => {
    h.findUnique.mockResolvedValue(null);

    const res = await DELETE(request(), { params });
    expect(res.status).toBe(404);
    expect(h.update).not.toHaveBeenCalled();
  });
});
