-- ============================================================
-- RATE LIMITS
--
-- Nothing throttled any public endpoint (B-64). Three took unauthenticated
-- traffic and each broke differently under a script:
--
--   /api/booking/create   every call holds a room for BOOKING_HOLD_MINUTES,
--                         so a walk of the room list took the whole property
--                         off the calendar for an hour, repeatedly.
--   /api/admin/auth/login credential stuffing, against a password that was
--                         published in git at the time (B-59).
--   /api/contact          unbounded rows here and unbounded Resend sends.
--
-- Counters live in Postgres rather than in process memory on purpose. Vercel
-- runs several instances and recycles them, so an in-memory window is per
-- instance and resets on a cold start — an attacker gets N× the limit and the
-- limit means nothing. This table is the same database every one of those
-- routes already writes to.
--
-- Fixed windows, not sliding: one row per (key, window_start), incremented by
-- a guarded UPDATE so the cap is enforced by the statement itself, the way
-- claimPromo enforces a redemption cap. A fixed window allows up to 2× the
-- limit across a boundary, which is the accepted trade for not keeping a
-- timestamp per request.
-- ============================================================

-- CreateTable
CREATE TABLE "rate_limits" (
    "key" TEXT NOT NULL,
    "window_start" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("key","window_start")
);

-- Old windows are dead weight the moment they close. The sweep in
-- /api/cron/expire-holds deletes them by age, so this index is what keeps that
-- from becoming a sequential scan of every request the site has ever served.
CREATE INDEX "rate_limits_window_start_idx" ON "rate_limits"("window_start");
