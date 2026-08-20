import { NextRequest } from "next/server";
import { expireStalePaymentHolds, BOOKING_HOLD_MINUTES } from "@/lib/booking-service";
import { ok } from "@/lib/api-response";
import { denyIfNotCron } from "@/lib/cron-auth";

// Vercel Cron: 30 0 * * * UTC daily (see vercel.json), between the night audit
// and the conflict detector.
//
// **Hourly is the right cadence for this one.** A hold released a day after it
// went stale is a room the site showed as unavailable for up to 24 hours. Daily
// is what the Hobby plan allows — sub-daily schedules require Pro and fail at
// deploy time otherwise, the same constraint documented for detect-conflicts.
// On Pro, change the schedule in vercel.json to "0 * * * *" and nothing else
// needs to move: the sweep is idempotent and bounded per run.
//
// `createBooking` also sweeps the single room being booked, so a guest looking
// directly at a held room is never blocked for longer than it takes them to
// press the button. This route is what keeps the *listing* honest.
export async function GET(req: NextRequest) {
  const denied = denyIfNotCron(req);
  if (denied) return denied;

  const result = await expireStalePaymentHolds();
  return ok({
    ...result,
    holdMinutes: BOOKING_HOLD_MINUTES,
    timestamp: new Date().toISOString(),
  });
}
