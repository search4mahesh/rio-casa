import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * The write side of the content model (B-53): the routes that make
 * `isApproved` reachable without a deploy. (The packages routes were the other
 * half and are gone — the property does not sell packages.)
 */

vi.mock("@/lib/api-auth", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    testimonial: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
  },
}));

import { GET as testimonialsGET } from "@/app/api/admin/testimonials/route";
import { PATCH as testimonialPATCH } from "@/app/api/admin/testimonials/[id]/route";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";

const db = prisma as unknown as {
  testimonial: {
    findMany: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn>;
  };
};

const params = Promise.resolve({ id: "x1" });

function patch(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    staff: { staffId: "s1", name: "Asha", email: "a@a.com", role: "manager" },
  } as never);
  db.testimonial.findMany.mockResolvedValue([]);
  db.testimonial.count.mockResolvedValue(0);
  db.testimonial.findUnique.mockResolvedValue({ id: "x1" });
  db.testimonial.update.mockResolvedValue({ id: "x1" });
});

describe("GET /api/admin/testimonials", () => {
  const url = "http://localhost/api/admin/testimonials";

  it("defaults to every testimonial, pending first", async () => {
    await testimonialsGET(new NextRequest(url));

    expect(db.testimonial.findMany.mock.calls[0][0].where).toEqual({});
    expect(db.testimonial.findMany.mock.calls[0][0].orderBy).toEqual([
      { isApproved: "asc" },
      { createdAt: "desc" },
    ]);
  });

  it("filters to pending when asked", async () => {
    await testimonialsGET(new NextRequest(`${url}?status=pending`));
    expect(db.testimonial.findMany.mock.calls[0][0].where).toEqual({ isApproved: false });
  });

  it("always reports the pending count, whichever view is shown", async () => {
    db.testimonial.count.mockResolvedValue(9);

    const body = await (await testimonialsGET(new NextRequest(`${url}?status=approved`))).json();

    expect(body.data.pendingCount).toBe(9);
    expect(db.testimonial.count.mock.calls[0][0].where).toEqual({ isApproved: false });
  });
});

describe("PATCH /api/admin/testimonials/[id]", () => {
  const url = "http://localhost/api/admin/testimonials/x1";

  it("publishes a testimonial", async () => {
    const res = await testimonialPATCH(patch(url, { isApproved: true }), { params });

    expect(res.status).toBe(200);
    expect(db.testimonial.update.mock.calls[0][0].data).toEqual({ isApproved: true });
  });

  it("takes one down again", async () => {
    await testimonialPATCH(patch(url, { isApproved: false }), { params });
    expect(db.testimonial.update.mock.calls[0][0].data).toEqual({ isApproved: false });
  });

  it("404s for one that does not exist", async () => {
    db.testimonial.findUnique.mockResolvedValue(null);

    expect((await testimonialPATCH(patch(url, { isApproved: true }), { params })).status).toBe(404);
    expect(db.testimonial.update).not.toHaveBeenCalled();
  });

  it("rejects a body without the flag", async () => {
    const res = await testimonialPATCH(patch(url, {}), { params });

    expect(res.status).toBe(400);
    expect(typeof (await res.json()).error).toBe("string");
  });

  it("returns the gate's own response to an insufficient role", async () => {
    const { forbidden } = await import("@/lib/rbac");
    vi.mocked(requireRole).mockResolvedValue({ ok: false, response: forbidden("manager") } as never);

    expect((await testimonialPATCH(patch(url, { isApproved: true }), { params })).status).toBe(403);
    expect(db.testimonial.findUnique).not.toHaveBeenCalled();
  });
});
