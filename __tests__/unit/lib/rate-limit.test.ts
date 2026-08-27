import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * B-64 — nothing throttled any public endpoint.
 *
 * The counter is mocked at the Postgres level rather than stubbed out, so
 * these tests pin the two properties the statement has to have: the returned
 * count is this request's own position in the window (not a read-then-write),
 * and the window key changes on a boundary rather than being expired by
 * anything.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(),
    rateLimit: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  },
}));

import { checkRateLimit, clientIp, tooManyRequests, sweepRateLimits, RATE_LIMITS } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

const db = prisma as unknown as {
  $queryRaw: ReturnType<typeof vi.fn>;
  rateLimit: { deleteMany: ReturnType<typeof vi.fn> };
};

/** Make the counter behave like the real INSERT … ON CONFLICT: nth call → n. */
function countsUpFrom(start = 1) {
  let n = start - 1;
  db.$queryRaw.mockImplementation(async () => [{ count: ++n }]);
}

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.rateLimit.deleteMany.mockResolvedValue({ count: 0 });
  });

  it("allows requests up to the limit and refuses the one after", async () => {
    countsUpFrom();
    const { limit } = RATE_LIMITS.contact;

    for (let i = 0; i < limit; i++) {
      expect((await checkRateLimit("contact", "1.2.3.4")).ok).toBe(true);
    }
    expect((await checkRateLimit("contact", "1.2.3.4")).ok).toBe(false);
  });

  it("reports seconds until the window closes, never zero", async () => {
    countsUpFrom(RATE_LIMITS.login.limit + 1);

    const res = await checkRateLimit("login", "1.2.3.4");

    expect(res.ok).toBe(false);
    expect(res.retryAfter).toBeGreaterThan(0);
    expect(res.retryAfter).toBeLessThanOrEqual(RATE_LIMITS.login.windowSeconds);
  });

  it("counts a caller's own position, not a value read before writing", async () => {
    // Two callers racing: the statement hands each a distinct count, so the
    // second cannot also see "limit - 1" and proceed.
    countsUpFrom(RATE_LIMITS.booking.limit);

    const first = await checkRateLimit("booking", "1.2.3.4");
    const second = await checkRateLimit("booking", "1.2.3.4");

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
  });

  it("starts a fresh window on the boundary", async () => {
    db.$queryRaw.mockResolvedValue([{ count: 1 }]);
    const windowMs = RATE_LIMITS.contact.windowSeconds * 1000;

    await checkRateLimit("contact", "1.2.3.4", new Date(windowMs * 10 + 5));
    await checkRateLimit("contact", "1.2.3.4", new Date(windowMs * 11 + 5));

    const starts = db.$queryRaw.mock.calls.map((c) => {
      // Tagged-template call: values follow the strings array.
      return (c as unknown[]).find((v) => v instanceof Date) as Date;
    });
    expect(starts[0].getTime()).toBe(windowMs * 10);
    expect(starts[1].getTime()).toBe(windowMs * 11);
    expect(starts[0].getTime()).not.toBe(starts[1].getTime());
  });

  it("keys different callers apart", async () => {
    db.$queryRaw.mockResolvedValue([{ count: 1 }]);

    await checkRateLimit("contact", "1.1.1.1");
    await checkRateLimit("contact", "2.2.2.2");

    const keys = db.$queryRaw.mock.calls.map(
      (c) => (c as unknown[]).find((v) => typeof v === "string" && v.startsWith("contact:")) as string
    );
    expect(keys).toEqual(["contact:1.1.1.1", "contact:2.2.2.2"]);
  });

  it("keys different scopes apart, so logins do not consume booking budget", async () => {
    db.$queryRaw.mockResolvedValue([{ count: 1 }]);

    await checkRateLimit("login", "1.1.1.1");
    await checkRateLimit("booking", "1.1.1.1");

    const keys = db.$queryRaw.mock.calls.map(
      (c) => (c as unknown[]).find((v) => typeof v === "string" && v.includes(":")) as string
    );
    expect(keys).toEqual(["login:1.1.1.1", "booking:1.1.1.1"]);
  });

  // A limiter that 500s a booking because its own counter table was
  // unreachable would be worse than the problem it exists to solve.
  it("fails open when the counter table is unreachable", async () => {
    db.$queryRaw.mockRejectedValue(new Error("connection terminated"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await checkRateLimit("booking", "1.2.3.4");

    expect(res.ok).toBe(true);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("clientIp", () => {
  function reqWith(headers: Record<string, string>) {
    return new NextRequest("http://localhost/api/contact", { method: "POST", headers });
  }

  it("takes the left-most x-forwarded-for entry — the client, not the proxy", () => {
    expect(clientIp(reqWith({ "x-forwarded-for": "203.0.113.7, 10.0.0.1, 10.0.0.2" }))).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip", () => {
    expect(clientIp(reqWith({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("buckets an unidentifiable caller rather than exempting them", () => {
    expect(clientIp(reqWith({}))).toBe("unknown");
  });

  it("ignores an empty x-forwarded-for instead of returning a blank key", () => {
    expect(clientIp(reqWith({ "x-forwarded-for": "", "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
  });
});

describe("tooManyRequests", () => {
  it("is a 429 carrying Retry-After and a plain-string error", async () => {
    const res = tooManyRequests(90, "Slow down.");

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("90");
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Slow down.");
  });
});

describe("sweepRateLimits", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes only windows that closed at least two windows ago", async () => {
    db.rateLimit.deleteMany.mockResolvedValue({ count: 12 });
    const now = new Date("2026-09-01T12:00:00Z");

    const cleared = await sweepRateLimits(now);

    expect(cleared).toBe(12);
    const cutoff = db.rateLimit.deleteMany.mock.calls[0][0].where.windowStart.lt as Date;
    const longest = Math.max(...Object.values(RATE_LIMITS).map((r) => r.windowSeconds)) * 1000;
    expect(cutoff.getTime()).toBe(now.getTime() - longest * 2);
    // Never inside a window still being counted against.
    expect(cutoff.getTime()).toBeLessThan(now.getTime() - longest);
  });
});
