import { NextRequest } from "next/server";
import { fail } from "@/lib/api-response";

// ─────────────────────────────────────────────────────────────
// Cron endpoint guard.
//
// Vercel invokes cron paths over the public internet and authenticates
// by sending `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is
// set as a project environment variable. These endpoints mutate data —
// runNightAudit() marks bookings as no_show — so the guard has to hold
// even when the environment is misconfigured.
//
// The previous inline check compared against `Bearer ${process.env.CRON_SECRET}`.
// With CRON_SECRET unset that template renders "Bearer undefined", which an
// attacker can simply send: the guard failed OPEN on exactly the deployment
// that forgot to configure it. Missing secret now refuses the request.
// ─────────────────────────────────────────────────────────────

/**
 * Returns a response to send back when the request is not an authorised
 * cron invocation, or `null` when the handler should proceed.
 */
export function denyIfNotCron(req: NextRequest) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    console.error("[cron] CRON_SECRET is not configured — refusing to run");
    return fail("Cron is not configured on this deployment", 503);
  }

  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return fail("Unauthorized", 401);
  }

  return null;
}
