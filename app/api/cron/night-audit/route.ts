import { NextRequest } from "next/server";
import { runNightAudit } from "@/lib/booking-service";
import { ok } from "@/lib/api-response";
import { denyIfNotCron } from "@/lib/cron-auth";

// Vercel Cron: 00:15 UTC daily (= 05:45 IST) — see vercel.json.
//
// Vercel schedules in UTC. runNightAudit() derives "yesterday" from the
// server clock, so running just after UTC midnight makes the day it closes
// out the day that has genuinely just ended for the resort. Moving this to
// midnight IST (18:30 UTC) would make it audit a day that is still running.
export async function GET(req: NextRequest) {
  const denied = denyIfNotCron(req);
  if (denied) return denied;

  const result = await runNightAudit();
  return ok({ ...result, timestamp: new Date().toISOString() });
}
