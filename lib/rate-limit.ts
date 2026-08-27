import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { fail } from "@/lib/api-response";

// ─────────────────────────────────────────────────────────────
// Request throttling for public endpoints.
//
// Nothing throttled anything (B-64), and the three unauthenticated routes
// each broke differently under a script: `/api/booking/create` holds a room
// per call and could take the whole property off the calendar for an hour,
// `/api/admin/auth/login` was stuffable against a password published in git,
// and `/api/contact` wrote unbounded rows and sent unbounded email.
//
// Counters live in Postgres, not in a module-level Map. Vercel runs several
// instances and recycles them, so an in-memory window is per instance and
// resets on every cold start: the effective limit is some unknown multiple of
// the configured one, which is not a limit. These routes are low-volume and
// already write to this database, so one more small upsert is not the cost
// that matters.
// ─────────────────────────────────────────────────────────────

export interface RateLimitRule {
  /** Requests permitted per window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the current window closes. Only meaningful when `!ok`. */
  retryAfter: number;
}

/**
 * The limits, in one place so they can be read against each other.
 *
 * `booking` is the tightest by intent rather than by traffic: a booking is a
 * deliberate act at the end of a multi-step wizard, and each one holds
 * inventory. Six an hour is far above what any real guest does and far below
 * what it takes to sweep the property.
 */
export const RATE_LIMITS = {
  /** Failed-or-not login attempts from one address. */
  login: { limit: 10, windowSeconds: 15 * 60 },
  /** Bookings created from one address. Each one holds a room. */
  booking: { limit: 6, windowSeconds: 60 * 60 },
  /** Contact form submissions from one address. */
  contact: { limit: 5, windowSeconds: 60 * 60 },
} as const satisfies Record<string, RateLimitRule>;

/**
 * The caller's address, as far as it can be known.
 *
 * Behind Vercel the left-most `x-forwarded-for` entry is the client; the
 * proxy appends its own hops to the right. Falls back to a single shared
 * bucket rather than to "unlimited" — an unidentifiable caller being throttled
 * alongside other unidentifiable callers is the safe direction to fail.
 */
export function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Count one request against `scope` for this caller.
 *
 * Fixed windows: the row key is (scope:ip, window start), so a window closes
 * by being replaced rather than by anything having to expire it. That allows
 * up to 2× the limit across a boundary — the accepted trade for not storing a
 * timestamp per request.
 *
 * **Never throws.** A limiter that 500s a booking because its own counter
 * table was unreachable would be worse than the problem it exists to solve,
 * so a database failure here fails *open* and is logged. That is the opposite
 * of the JWT_SECRET rule, and deliberately: a missing secret means anyone may
 * act as an owner, while a missing counter means a caller is un-throttled for
 * as long as the database is down — during which they cannot book anything
 * either.
 */
export async function checkRateLimit(
  scope: keyof typeof RATE_LIMITS,
  identifier: string,
  now: Date = new Date()
): Promise<RateLimitResult> {
  const rule: RateLimitRule = RATE_LIMITS[scope];
  const windowMs = rule.windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const retryAfter = Math.max(1, Math.ceil((windowStart.getTime() + windowMs - now.getTime()) / 1000));

  try {
    // One statement, and the returned count is this request's own position in
    // the window — so two simultaneous callers cannot both read "limit - 1"
    // and both proceed. Same reasoning as the guarded UPDATE in claimPromo.
    const [row] = await prisma.$queryRaw<Array<{ count: number }>>`
      INSERT INTO rate_limits ("key", window_start, count)
      VALUES (${`${scope}:${identifier}`}, ${windowStart}, 1)
      ON CONFLICT ("key", window_start)
      DO UPDATE SET count = rate_limits.count + 1
      RETURNING count
    `;

    return { ok: Number(row?.count ?? 1) <= rule.limit, retryAfter };
  } catch (err) {
    console.error(`[rate-limit] Counter unavailable for ${scope}; allowing request.`, err);
    return { ok: true, retryAfter };
  }
}

/**
 * The 429 to return when `checkRateLimit` says no.
 *
 * `Retry-After` is in the response because a client that respects it stops
 * hammering on its own, and `error` is the usual plain string every panel and
 * form renders directly.
 */
export function tooManyRequests(retryAfter: number, message: string) {
  const res = fail(message, 429);
  res.headers.set("Retry-After", String(retryAfter));
  return res;
}

/**
 * Delete windows that have long since closed.
 *
 * Called from `/api/cron/expire-holds`, which already runs on a schedule and
 * already exists to sweep something stale. Bounded by age rather than by row
 * count: the index on `window_start` makes it a range delete.
 */
export async function sweepRateLimits(now: Date = new Date()): Promise<number> {
  const longestWindowMs = Math.max(...Object.values(RATE_LIMITS).map((r) => r.windowSeconds)) * 1000;
  // Two windows back, so a window still being counted against is never removed.
  const cutoff = new Date(now.getTime() - longestWindowMs * 2);

  const { count } = await prisma.rateLimit.deleteMany({
    where: { windowStart: { lt: cutoff } },
  });
  return count;
}
