import { NextRequest } from "next/server";
import { expireStalePaymentHolds, BOOKING_HOLD_MINUTES } from "@/lib/booking-service";
import { ok } from "@/lib/api-response";
import { denyIfNotCron } from "@/lib/cron-auth";
import { sweepRateLimits } from "@/lib/rate-limit";

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

  // Closed rate-limit windows ride along on the job that already exists to
  // clear stale rows. They are pure dead weight once their window has passed,
  // and nothing else would ever delete them. Non-fatal on purpose: the holds
  // are the reason this route runs, and a failed tidy-up must not report the
  // sweep that did happen as a failure.
  let rateLimitRowsCleared = 0;
  try {
    rateLimitRowsCleared = await sweepRateLimits();
  } catch (err) {
    console.error("[cron/expire-holds] Rate-limit sweep failed:", err);
  }

  return ok({
    ...result,
    rateLimitRowsCleared,
    holdMinutes: BOOKING_HOLD_MINUTES,
    timestamp: new Date().toISOString(),
  });
}
