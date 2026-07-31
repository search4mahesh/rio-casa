import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync, existsSync } from "fs";
import path from "path";

vi.mock("@/lib/booking-service", () => ({
  runNightAudit: vi.fn().mockResolvedValue({ noShows: 0, dueCheckouts: 0, arrivals: 0 }),
  detectConflicts: vi.fn().mockResolvedValue([]),
  pullOTABookings: vi.fn().mockResolvedValue(undefined),
}));

import { GET as nightAuditGET } from "@/app/api/cron/night-audit/route";
import { GET as conflictsGET } from "@/app/api/cron/detect-conflicts/route";

function req(authHeader?: string) {
  return new NextRequest("http://localhost/api/cron/x", {
    method: "GET",
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

const ORIGINAL = process.env.CRON_SECRET;
beforeEach(() => { process.env.CRON_SECRET = "s3cret"; });
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIGINAL;
});

describe("cron auth — happy path", () => {
  it("accepts the correct bearer token", async () => {
    expect((await nightAuditGET(req("Bearer s3cret"))).status).toBe(200);
    expect((await conflictsGET(req("Bearer s3cret"))).status).toBe(200);
  });

  it("rejects a wrong token", async () => {
    expect((await nightAuditGET(req("Bearer wrong"))).status).toBe(401);
  });

  it("rejects a missing header", async () => {
    expect((await nightAuditGET(req())).status).toBe(401);
  });
});

describe("cron auth — regression: must fail CLOSED when CRON_SECRET is unset", () => {
  beforeEach(() => { delete process.env.CRON_SECRET; });

  // The old inline guard compared against `Bearer ${process.env.CRON_SECRET}`,
  // which renders "Bearer undefined" when the variable is missing — so this
  // exact request used to be ACCEPTED and would run the night audit, marking
  // real bookings as no_show over an unauthenticated public URL.
  it("does not accept the literal string 'Bearer undefined'", async () => {
    const res = await nightAuditGET(req("Bearer undefined"));
    expect(res.status).not.toBe(200);
    expect(res.status).toBe(503);
  });

  it("refuses every cron route rather than running unauthenticated", async () => {
    expect((await nightAuditGET(req("Bearer undefined"))).status).toBe(503);
    expect((await conflictsGET(req("Bearer undefined"))).status).toBe(503);
    expect((await nightAuditGET(req())).status).toBe(503);
  });

  it("does not invoke the audit when refusing", async () => {
    const { runNightAudit } = await import("@/lib/booking-service");
    vi.mocked(runNightAudit).mockClear();
    await nightAuditGET(req("Bearer undefined"));
    expect(runNightAudit).not.toHaveBeenCalled();
  });
});

describe("vercel.json cron schedule", () => {
  const vercelJson = JSON.parse(
    readFileSync(path.join(process.cwd(), "vercel.json"), "utf8")
  ) as { crons?: Array<{ path: string; schedule: string }> };

  it("schedules the night audit and the conflict detector", () => {
    const paths = (vercelJson.crons ?? []).map((c) => c.path);
    expect(paths).toContain("/api/cron/night-audit");
    expect(paths).toContain("/api/cron/detect-conflicts");
  });

  it("every scheduled path resolves to a real route file", () => {
    for (const cron of vercelJson.crons ?? []) {
      // App Router: a cron path of /api/cron/x maps to app/api/cron/x/route.ts
      const file = path.join(process.cwd(), "app", cron.path, "route.ts");
      expect(existsSync(file), `${cron.path} has no route.ts`).toBe(true);
    }
  });

  it("uses only once-per-day schedules, which Hobby allows", () => {
    // Sub-daily expressions fail at deploy time on the Hobby plan. If this
    // project moves to Pro, relax this test alongside the schedule change.
    for (const cron of vercelJson.crons ?? []) {
      const [minute, hour] = cron.schedule.split(" ");
      expect(minute, `${cron.path} minute field must be fixed`).toMatch(/^\d+$/);
      expect(hour, `${cron.path} hour field must be fixed`).toMatch(/^\d+$/);
    }
  });

  it("does not schedule the shelved eZee OTA pull", () => {
    const paths = (vercelJson.crons ?? []).map((c) => c.path);
    expect(paths).not.toContain("/api/cron/pull-ota");
  });
});
