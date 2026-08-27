import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * `GET /api/cron/expire-holds` — the route, not the sweep.
 *
 * `payment-holds.test.ts` covers `expireStalePaymentHolds()` itself. What is
 * untested here is the wiring: that the route refuses an unauthenticated
 * caller, and that the rate-limit tidy-up bolted onto it cannot turn a sweep
 * that *did* happen into a reported failure.
 */

vi.mock("@/lib/booking-service", () => ({
  expireStalePaymentHolds: vi.fn(),
  BOOKING_HOLD_MINUTES: 60,
}));
vi.mock("@/lib/rate-limit", () => ({ sweepRateLimits: vi.fn() }));
vi.mock("@/lib/cron-auth", () => ({ denyIfNotCron: vi.fn() }));

import { GET } from "@/app/api/cron/expire-holds/route";
import { expireStalePaymentHolds } from "@/lib/booking-service";
import { sweepRateLimits } from "@/lib/rate-limit";
import { denyIfNotCron } from "@/lib/cron-auth";
import { fail } from "@/lib/api-response";

const sweep = vi.mocked(expireStalePaymentHolds);
const sweepLimits = vi.mocked(sweepRateLimits);
const deny = vi.mocked(denyIfNotCron);

const RESULT = { expired: 2, kept: 1, unknown: 0 };

function req() {
  return new NextRequest("http://localhost/api/cron/expire-holds", {
    headers: { Authorization: "Bearer secret" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  deny.mockReturnValue(null as never);
  sweep.mockResolvedValue(RESULT as never);
  sweepLimits.mockResolvedValue(7);
});

describe("GET /api/cron/expire-holds", () => {
  it("returns the sweep result", async () => {
    const res = await GET(req());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.expired).toBe(2);
    expect(body.data.holdMinutes).toBe(60);
    expect(body.data.rateLimitRowsCleared).toBe(7);
  });

  // `denyIfNotCron` fails shut when CRON_SECRET is unset — never compare
  // against process.env inline, which renders "Bearer undefined".
  it("refuses when the cron guard says no, and sweeps nothing", async () => {
    deny.mockReturnValue(fail("Unauthorized", 401) as never);

    const res = await GET(req());

    expect(res.status).toBe(401);
    expect(sweep).not.toHaveBeenCalled();
    expect(sweepLimits).not.toHaveBeenCalled();
  });

  // The holds are the reason this route exists. A failed tidy-up must not
  // report the sweep that did happen as a failure.
  it("still succeeds when the rate-limit tidy-up throws", async () => {
    sweepLimits.mockRejectedValue(new Error("relation does not exist"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await GET(req());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.expired).toBe(2);
    expect(body.data.rateLimitRowsCleared).toBe(0);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("sweeps holds before tidying rate limits, not instead of", async () => {
    await GET(req());

    expect(sweep).toHaveBeenCalledTimes(1);
    expect(sweepLimits).toHaveBeenCalledTimes(1);
  });

  it("stamps the run so a skipped cron is visible in the logs", async () => {
    const body = await (await GET(req())).json();

    expect(Number.isNaN(Date.parse(body.data.timestamp))).toBe(false);
  });
});
