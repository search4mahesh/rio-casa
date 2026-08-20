import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { state, db } = vi.hoisted(() => ({
  state: { role: "owner" as string },
  db: {
    linenItems: [
      { id: "li1", name: "Bath Towel", ratePerPiece: 15 },
      { id: "li2", name: "Pillow Cover", ratePerPiece: 6 },
    ],
    batch: null as null | Record<string, unknown>,
    items: [] as Array<Record<string, unknown>>,
  },
}));

vi.mock("@/lib/admin-auth", () => ({
  verifyAdminToken: vi.fn(async () => ({ staffId: "s1", name: "Asha", email: "a@a.com", role: state.role })),
  ADMIN_COOKIE: "admin_token",
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    linenItem: {
      findMany: vi.fn(async ({ where }: { where?: { id?: { in: string[] } } }) =>
        where?.id?.in ? db.linenItems.filter((l) => where.id!.in.includes(l.id)) : db.linenItems
      ),
      update: vi.fn(async () => db.linenItems[0]),
    },
    // Batch numbers come from the shared `daily_counters` allocator, not from a
    // COUNT of same-day batches — see nextDailyNumber in lib/booking-service.
    $queryRaw: vi.fn(async () => [{ last_seq: 1 }]),
    laundryBatch: {
      findMany: vi.fn(async () => []),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...data, id: "b1", totalCost: data.totalCost })),
      findUnique: vi.fn(async () => db.batch),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...(db.batch ?? {}), ...data, items: db.items, totalCost: 0,
      })),
      delete: vi.fn(async () => ({})),
    },
    laundryBatchItem: {
      update: vi.fn(async () => ({})),
      findMany: vi.fn(async () => db.items),
    },
    auditLog: { create: vi.fn(async () => ({})) },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
  },
}));

import { POST } from "@/app/api/admin/laundry/route";
import { PATCH } from "@/app/api/admin/laundry/[id]/route";

function req(body: unknown) {
  const r = new NextRequest("http://localhost/api/admin/laundry", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
  r.cookies.set("admin_token", "tok");
  return r;
}

beforeEach(() => {
  state.role = "owner";
  db.batch = null;
  db.items = [];
});

describe("POST /api/admin/laundry — dispatch", () => {
  it("costs the batch from each item's current rate", async () => {
    const res = await POST(req({
      sentDate: "2026-07-31",
      items: [{ linenItemId: "li1", qtySent: 20 }, { linenItemId: "li2", qtySent: 18 }],
    }));
    expect(res.status).toBe(201);
    const { data } = await res.json();
    // 20 × ₹15 + 18 × ₹6 = ₹408
    expect(data.totalCost).toBe(408);
    expect(data.totalPieces).toBe(38);
    expect(data.batchNumber).toBe("LB-20260731-01");
  });

  it("rejects the same item listed twice", async () => {
    const res = await POST(req({
      sentDate: "2026-07-31",
      items: [{ linenItemId: "li1", qtySent: 5 }, { linenItemId: "li1", qtySent: 3 }],
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/twice/i);
  });

  it("rejects an unknown item", async () => {
    const res = await POST(req({ sentDate: "2026-07-31", items: [{ linenItemId: "nope", qtySent: 5 }] }));
    expect(res.status).toBe(400);
  });

  it("rejects an empty dispatch", async () => {
    const res = await POST(req({ sentDate: "2026-07-31", items: [] }));
    expect(res.status).toBe(400);
    expect(typeof (await res.json()).error).toBe("string");
  });

  it("rejects a zero quantity", async () => {
    const res = await POST(req({ sentDate: "2026-07-31", items: [{ linenItemId: "li1", qtySent: 0 }] }));
    expect(res.status).toBe(400);
  });

  it("is open to housekeeping staff", async () => {
    state.role = "housekeeping";
    const res = await POST(req({ sentDate: "2026-07-31", items: [{ linenItemId: "li1", qtySent: 2 }] }));
    expect(res.status).toBe(201);
  });
});

describe("PATCH /api/admin/laundry/[id] — return", () => {
  function seed(items: Array<{ id: string; qtySent: number; qtyReturned?: number; qtyDamaged?: number }>) {
    db.batch = { id: "b1", batchNumber: "LB-1", status: "sent", items };
    db.items = items.map((i) => ({ qtyReturned: 0, qtyDamaged: 0, ...i, batchId: "b1" }));
  }
  function patch(body: unknown) {
    const r = new NextRequest("http://localhost/api/admin/laundry/b1", {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
    r.cookies.set("admin_token", "tok");
    return PATCH(r, { params: { id: "b1" } });
  }

  it("marks the batch returned when everything is accounted for", async () => {
    seed([{ id: "i1", qtySent: 20 }]);
    db.items = [{ id: "i1", qtySent: 20, qtyReturned: 20, qtyDamaged: 0 }];
    const res = await patch({ returnedDate: "2026-08-02", items: [{ id: "i1", qtyReturned: 20, qtyDamaged: 0 }] });
    expect(res.status).toBe(200);
    expect((await res.json()).data.status).toBe("returned");
  });

  it("counts damaged pieces as accounted for, not missing", async () => {
    seed([{ id: "i1", qtySent: 20 }]);
    db.items = [{ id: "i1", qtySent: 20, qtyReturned: 18, qtyDamaged: 2 }];
    const res = await patch({ returnedDate: "2026-08-02", items: [{ id: "i1", qtyReturned: 18, qtyDamaged: 2 }] });
    expect((await res.json()).data.status).toBe("returned");
  });

  it("stays open when pieces are still missing, so they keep showing as outstanding", async () => {
    seed([{ id: "i1", qtySent: 20 }]);
    db.items = [{ id: "i1", qtySent: 20, qtyReturned: 19, qtyDamaged: 0 }];
    const res = await patch({ returnedDate: "2026-08-02", items: [{ id: "i1", qtyReturned: 19, qtyDamaged: 0 }] });
    expect((await res.json()).data.status).toBe("partial");
  });

  // Without this guard the outstanding count goes negative and the system
  // silently invents linen that was never sent.
  it("refuses to accept more back than went out", async () => {
    seed([{ id: "i1", qtySent: 20 }]);
    const res = await patch({ returnedDate: "2026-08-02", items: [{ id: "i1", qtyReturned: 25, qtyDamaged: 0 }] });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/exceeds/i);
  });

  it("refuses when returned + damaged together exceed what was sent", async () => {
    seed([{ id: "i1", qtySent: 20 }]);
    const res = await patch({ returnedDate: "2026-08-02", items: [{ id: "i1", qtyReturned: 18, qtyDamaged: 5 }] });
    expect(res.status).toBe(400);
  });

  it("rejects a line that does not belong to the batch", async () => {
    seed([{ id: "i1", qtySent: 20 }]);
    const res = await patch({ returnedDate: "2026-08-02", items: [{ id: "other", qtyReturned: 1, qtyDamaged: 0 }] });
    expect(res.status).toBe(400);
  });

  it("404s for a batch that does not exist", async () => {
    db.batch = null;
    const res = await patch({ returnedDate: "2026-08-02", items: [{ id: "i1", qtyReturned: 1, qtyDamaged: 0 }] });
    expect(res.status).toBe(404);
  });
});
