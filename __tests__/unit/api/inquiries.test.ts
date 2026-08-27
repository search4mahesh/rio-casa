import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * B-61 — `contact_inquiries` had a writer and no reader.
 *
 * `/api/contact` created a row and nothing in the application ever selected
 * one, so an inquiry reached staff only if the best-effort Resend
 * notification landed. These cover the read side, and the handled flag that
 * makes the panel a worklist rather than a log.
 */

vi.mock("@/lib/api-auth", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    contactInquiry: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  },
}));

import { GET } from "@/app/api/admin/inquiries/route";
import { PATCH } from "@/app/api/admin/inquiries/[id]/route";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";

const db = (prisma as unknown as {
  contactInquiry: {
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
}).contactInquiry;

const row = {
  id: "ci_1",
  name: "Asha Patil",
  email: "asha@example.com",
  phone: "9876543210",
  message: "Is a family room free in September?",
  handledAt: null,
  handledBy: null,
  createdAt: new Date("2026-08-20T09:00:00Z"),
};

function get(qs = "") {
  return new NextRequest(`http://localhost/api/admin/inquiries${qs}`, { method: "GET" });
}

function patch(body: unknown) {
  return new NextRequest("http://localhost/api/admin/inquiries/ci_1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: "ci_1" });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    staff: { staffId: "s1", name: "Ravi Kulkarni", email: "r@riocasa.in", role: "frontdesk" },
  } as never);
  db.findMany.mockResolvedValue([row]);
  db.count.mockResolvedValue(1);
  db.findUnique.mockResolvedValue({ id: "ci_1" });
  db.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...row, ...data }));
});

describe("GET /api/admin/inquiries", () => {
  it("returns inquiries with the open count", async () => {
    const res = await GET(get());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // Payloads always come back under `data` — see lib/api-response.ts.
    expect(body.data.inquiries).toHaveLength(1);
    expect(body.data.openCount).toBe(1);
  });

  it("defaults to what is still open, not everything", async () => {
    await GET(get());

    expect(db.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { handledAt: null } })
    );
  });

  it("filters to handled when asked", async () => {
    await GET(get("?status=handled"));

    expect(db.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { handledAt: { not: null } } })
    );
  });

  it("returns everything for status=all", async () => {
    await GET(get("?status=all"));

    expect(db.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });

  it("reports the open count even while showing the handled view", async () => {
    db.count.mockResolvedValueOnce(4).mockResolvedValueOnce(2);

    const body = await (await GET(get("?status=handled"))).json();

    expect(body.data.total).toBe(4);
    expect(body.data.openCount).toBe(2);
  });

  it("shows newest first — an inbox reads from the top", async () => {
    await GET(get());

    expect(db.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "desc" } })
    );
  });

  // B-41: parseInt returns NaN, and `skip: NaN` reaches Prisma and kills the
  // request with an empty 500.
  it("survives a junk page param instead of 500ing on NaN", async () => {
    const res = await GET(get("?page=abc"));

    expect(res.status).toBe(200);
    const skip = db.findMany.mock.calls[0][0].skip;
    expect(Number.isNaN(skip)).toBe(false);
    expect(skip).toBe(0);
  });

  it("pages from the requested offset", async () => {
    await GET(get("?page=3"));

    const { skip, take } = db.findMany.mock.calls[0][0];
    expect(take).toBe(20);
    expect(skip).toBe(40);
  });

  it("is open to front desk, not gated at manager", async () => {
    await GET(get());
    expect(requireRole).toHaveBeenCalledWith(expect.anything(), "frontdesk");
  });

  it("returns the gate's own response when unauthenticated", async () => {
    const { fail } = await import("@/lib/api-response");
    vi.mocked(requireRole).mockResolvedValue({ ok: false, response: fail("nope", 401) } as never);

    const res = await GET(get());

    expect(res.status).toBe(401);
    expect(db.findMany).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/admin/inquiries/[id]", () => {
  it("stamps who handled it and when", async () => {
    const res = await PATCH(patch({ handled: true }), { params });

    expect(res.status).toBe(200);
    const data = db.update.mock.calls[0][0].data;
    expect(data.handledAt).toBeInstanceOf(Date);
    // From the session, never from the client body.
    expect(data.handledBy).toBe("Ravi Kulkarni");
  });

  it("clears both fields when reopened", async () => {
    await PATCH(patch({ handled: false }), { params });

    expect(db.update.mock.calls[0][0].data).toEqual({ handledAt: null, handledBy: null });
  });

  it("404s for an inquiry that does not exist", async () => {
    db.findUnique.mockResolvedValue(null);

    const res = await PATCH(patch({ handled: true }), { params });

    expect(res.status).toBe(404);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("rejects a body without the flag, as a string error", async () => {
    const res = await PATCH(patch({ nonsense: 1 }), { params });

    expect(res.status).toBe(400);
    expect(typeof (await res.json()).error).toBe("string");
    expect(db.update).not.toHaveBeenCalled();
  });

  it("rejects a body that is not JSON at all", async () => {
    const bad = new NextRequest("http://localhost/api/admin/inquiries/ci_1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{ not json",
    });

    const res = await PATCH(bad, { params });

    expect(res.status).toBe(400);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("will not let a client dictate who handled it", async () => {
    await PATCH(patch({ handled: true, handledBy: "Someone Else" }), { params });

    expect(db.update.mock.calls[0][0].data.handledBy).toBe("Ravi Kulkarni");
  });
});
