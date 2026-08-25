/**
 * `apiJson` replaced 59 hand-written `fetch` + `res.json()` pairs across the
 * admin UI. Every one of them used to sit above a `setLoading(false)` that an
 * exception would skip, which is what left panels on "Loading…" for good
 * (B-39). The contract these tests hold is narrow and total:
 *
 *   it never throws, and `error` is always a non-empty string.
 *
 * If either stops being true, a panel hangs again or shows staff "undefined".
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { apiJson } from "@/lib/api-client";

function mockFetch(impl: () => Promise<unknown> | never) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

/** A `Response` whose `.json()` behaves like the real one for `body`. */
function response(body: string, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => {
      if (body === "") throw new SyntaxError("Unexpected end of JSON input");
      return JSON.parse(body);
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("apiJson — success", () => {
  it("passes the payload straight through", async () => {
    mockFetch(async () => response(JSON.stringify({ success: true, data: [{ id: "p1" }] })));

    const r = await apiJson<Array<{ id: string }>>("/api/admin/promos");

    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual([{ id: "p1" }]);
  });

  it("carries `message` for acknowledgement responses (okMessage)", async () => {
    mockFetch(async () => response(JSON.stringify({ success: true, message: "Guest checked out" })));

    const r = await apiJson("/api/admin/bookings/b1/checkout", { method: "PATCH" });

    expect(r.success).toBe(true);
    if (r.success) expect(r.message).toBe("Guest checked out");
  });
});

describe("apiJson — the failures that used to hang a panel", () => {
  it("does not throw on an empty 500 body, and says something true about it", async () => {
    // Exactly what an unhandled route error returns (B-41). `res.json()` throws
    // here, which is the bug: `setLoading(false)` never ran.
    mockFetch(async () => response("", 500));

    const r = await apiJson("/api/admin/reconciliation?month=2026-99");

    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(/server ran into a problem/i);
  });

  it("does not reject when the network is down", async () => {
    mockFetch(() => Promise.reject(new TypeError("Failed to fetch")));

    const r = await apiJson("/api/admin/promos");

    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(/could not reach the server/i);
  });

  it("survives a body that is valid JSON but not the envelope", async () => {
    mockFetch(async () => response('"just a string"', 502));

    const r = await apiJson("/api/admin/promos");
    expect(r.success).toBe(false);
    if (!r.success) expect(typeof r.error).toBe("string");
  });
});

describe("apiJson — `error` is always a readable string", () => {
  it("uses the route's own message when there is one", async () => {
    mockFetch(async () => response(JSON.stringify({ success: false, error: "Use YYYY-MM for month" }), 400));

    const r = await apiJson("/api/admin/expenses?month=2026-99");
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe("Use YYYY-MM for month");
  });

  it("fills one in for a 401 that carries none — the B-40 shape", async () => {
    // `requireRole` used to answer exactly this, and a panel rendering
    // `data.error` showed the staff member nothing at all.
    mockFetch(async () => response(JSON.stringify({ success: false }), 401));

    const r = await apiJson("/api/admin/bookings");
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(/session has expired/i);
  });

  it("never hands a non-string `error` to a caller that renders it", async () => {
    // A Zod error object here is what used to render "[object Object]".
    mockFetch(async () =>
      response(JSON.stringify({ success: false, error: { issues: [{ message: "nope" }] } }), 400)
    );

    const r = await apiJson("/api/admin/promos", { method: "POST" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(typeof r.error).toBe("string");
      expect(r.error).not.toContain("object Object");
    }
  });

  it("does not treat an empty-string error as usable", async () => {
    mockFetch(async () => response(JSON.stringify({ success: false, error: "" }), 403));

    const r = await apiJson("/api/admin/staff");
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(/permission/i);
  });
});
