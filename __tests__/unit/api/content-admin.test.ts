import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * The write side of the content model (B-53): the two routes that make
 * `isApproved` and a package price reachable without a deploy.
 */

vi.mock("@/lib/api-auth", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    package: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    testimonial: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
  },
}));

import { GET as packagesGET } from "@/app/api/admin/packages/route";
import { PATCH as packagePATCH } from "@/app/api/admin/packages/[id]/route";
import { GET as testimonialsGET } from "@/app/api/admin/testimonials/route";
import { PATCH as testimonialPATCH } from "@/app/api/admin/testimonials/[id]/route";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";

const db = prisma as unknown as {
  package: { findMany: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
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
  db.package.findMany.mockResolvedValue([]);
  db.package.findUnique.mockResolvedValue({ validFrom: null, validTo: null });
  db.package.update.mockResolvedValue({ id: "x1" });
  db.testimonial.findMany.mockResolvedValue([]);
  db.testimonial.count.mockResolvedValue(0);
  db.testimonial.findUnique.mockResolvedValue({ id: "x1" });
  db.testimonial.update.mockResolvedValue({ id: "x1" });
});

describe("GET /api/admin/packages", () => {
  // The panel manages packages; the public reader advertises them. Only the
  // public side filters on isActive and the validity window.
  it("returns retired packages too, unlike the public reader", async () => {
    await packagesGET(new NextRequest("http://localhost/api/admin/packages"));

    expect(db.package.findMany.mock.calls[0][0].where).toBeUndefined();
  });
});

describe("PATCH /api/admin/packages/[id]", () => {
  const url = "http://localhost/api/admin/packages/x1";

  it("updates a price", async () => {
    const res = await packagePATCH(patch(url, { price: 12500 }), { params });

    expect(res.status).toBe(200);
    expect(db.package.update.mock.calls[0][0].data.price).toBe(12500);
  });

  // These are @db.Date columns. `dateOnly` returns UTC midnight; a Date built
  // from local parts is the previous day once Postgres truncates it in IST.
  it("stores a window at UTC midnight, not local midnight", async () => {
    await packagePATCH(patch(url, { validFrom: "2026-07-01", validTo: "2026-09-30" }), { params });

    const { validFrom, validTo } = db.package.update.mock.calls[0][0].data;
    expect(validFrom.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(validTo.toISOString()).toBe("2026-09-30T00:00:00.000Z");
  });

  it("clears the window when a date is sent as null", async () => {
    db.package.findUnique.mockResolvedValue({
      validFrom: new Date("2026-07-01T00:00:00Z"),
      validTo: new Date("2026-09-30T00:00:00Z"),
    });

    await packagePATCH(patch(url, { validFrom: null, validTo: null }), { params });

    const { validFrom, validTo } = db.package.update.mock.calls[0][0].data;
    expect(validFrom).toBeNull();
    expect(validTo).toBeNull();
  });

  it("leaves an untouched window alone", async () => {
    const from = new Date("2026-07-01T00:00:00Z");
    db.package.findUnique.mockResolvedValue({ validFrom: from, validTo: null });

    await packagePATCH(patch(url, { price: 100 }), { params });

    expect(db.package.update.mock.calls[0][0].data.validFrom).toBe(from);
  });

  // A backwards window hides the package with no indication why — the public
  // reader simply never matches it.
  it("refuses a window that ends before it starts", async () => {
    const res = await packagePATCH(
      patch(url, { validFrom: "2026-09-30", validTo: "2026-07-01" }), { params }
    );

    expect(res.status).toBe(400);
    expect(db.package.update).not.toHaveBeenCalled();
  });

  // B-45: a bare regex accepts 2026-02-30, which dateOnly then throws on.
  it("rejects a date that does not exist with a 400", async () => {
    const res = await packagePATCH(patch(url, { validFrom: "2026-02-30" }), { params });

    expect(res.status).toBe(400);
    expect(typeof (await res.json()).error).toBe("string");
    expect(db.package.update).not.toHaveBeenCalled();
  });

  it("refuses a price of zero or below", async () => {
    expect((await packagePATCH(patch(url, { price: 0 }), { params })).status).toBe(400);
    expect((await packagePATCH(patch(url, { price: -5 }), { params })).status).toBe(400);
    expect(db.package.update).not.toHaveBeenCalled();
  });

  it("404s for a package that does not exist", async () => {
    db.package.findUnique.mockResolvedValue(null);

    expect((await packagePATCH(patch(url, { price: 100 }), { params })).status).toBe(404);
  });
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
