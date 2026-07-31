import { NextRequest } from "next/server";
import { detectConflicts } from "@/lib/booking-service";
import { ok } from "@/lib/api-response";
import { denyIfNotCron } from "@/lib/cron-auth";

// Vercel Cron: 00:45 UTC daily (see vercel.json), staggered after the night
// audit. Hourly would be better for a double-booking net, but sub-daily
// schedules require a Vercel Pro plan and FAIL AT DEPLOY TIME on Hobby.
// On Pro, change the schedule in vercel.json to "0 * * * *".
export async function GET(req: NextRequest) {
  const denied = denyIfNotCron(req);
  if (denied) return denied;

  const conflicts = await detectConflicts();
  return ok({ conflicts: conflicts.length, data: conflicts, timestamp: new Date().toISOString() });
}
