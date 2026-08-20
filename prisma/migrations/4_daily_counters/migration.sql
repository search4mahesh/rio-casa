-- ============================================================
-- DAILY SEQUENCE COUNTERS
--
-- Generalises `booking_counters` so more than one kind of daily-numbered
-- document can use it. Laundry batch numbers were still derived the way
-- booking numbers used to be:
--
--     COUNT(*) WHERE batch_number LIKE 'LB-<day>%'   →  suffix = count + 1
--
-- which is the exact race 2_booking_counter was written to kill. Two staff
-- dispatching a batch on the same day read the same count, computed the same
-- suffix, and the second insert died on the unique index on `batch_number` —
-- surfacing as "Server error" with the linen already counted out and handed
-- over.
--
-- A second counter table would have worked, but two copies of an allocator is
-- how the two booking paths drifted apart in the first place. One table, one
-- function, a `scope` to separate the sequences.
--
-- DDL is transactional in Postgres: this either applies whole or not at all,
-- so `booking_counters` cannot be dropped without its replacement existing.
-- Deploy the migration and the code together — the old code reads a table this
-- removes.
-- ============================================================

CREATE TABLE IF NOT EXISTS daily_counters (
    scope    TEXT    NOT NULL,
    day      DATE    NOT NULL,
    last_seq INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT daily_counters_pkey PRIMARY KEY (scope, day)
);

-- Carry the booking sequences over unchanged. Skipped cleanly on a database
-- that never had 2_booking_counter applied.
INSERT INTO daily_counters (scope, day, last_seq)
SELECT 'booking', day, last_seq
  FROM booking_counters
ON CONFLICT (scope, day) DO UPDATE
    SET last_seq = GREATEST(daily_counters.last_seq, EXCLUDED.last_seq);

DROP TABLE IF EXISTS booking_counters;

-- Seed the laundry sequence from the numbers already issued, for the same
-- reason 2_booking_counter backfilled bookings: starting from zero would
-- re-issue a `batch_number` that already exists and fail on its unique index.
-- Anything not shaped like LB-YYYYMMDD-NN is left alone.
--
-- `[0-9]` and not `\d`. The class-shorthand escape is documented for Postgres
-- AREs but evaluates false here — `'LB-20260727-01' ~ '^LB-\d{8}-\d+$'` returns
-- false against this database while the bracket form returns true. A backfill
-- that matches nothing fails silently and hands the next dispatch a number that
-- already exists, which is the exact collision this table prevents. Verified
-- against the live database before applying; 2_booking_counter has the same
-- `\d` and is logged as B-22.
INSERT INTO daily_counters (scope, day, last_seq)
SELECT 'laundry',
       to_date(split_part(batch_number, '-', 2), 'YYYYMMDD'),
       MAX(split_part(batch_number, '-', 3)::int)
  FROM laundry_batches
 WHERE batch_number ~ '^LB-[0-9]{8}-[0-9]+$'
 GROUP BY 1, 2
ON CONFLICT (scope, day) DO UPDATE
    SET last_seq = GREATEST(daily_counters.last_seq, EXCLUDED.last_seq);

-- Backstop for booking numbers whose day never got a counter row, for the same
-- reason: if 2_booking_counter's backfill matched nothing, the next booking for
-- one of those days would re-issue a number that already exists.
INSERT INTO daily_counters (scope, day, last_seq)
SELECT 'booking',
       to_date(split_part(booking_number, '-', 2), 'YYYYMMDD'),
       MAX(split_part(booking_number, '-', 3)::int)
  FROM bookings
 WHERE booking_number ~ '^BK-[0-9]{8}-[0-9]+$'
 GROUP BY 1, 2
ON CONFLICT (scope, day) DO UPDATE
    SET last_seq = GREATEST(daily_counters.last_seq, EXCLUDED.last_seq);
