-- ============================================================
-- BOOKING NUMBER ALLOCATION
--
-- Replaces the `COUNT(*) FROM bookings` that used to run inside the booking
-- transaction to derive the `-NNN` suffix.
--
-- That count was broken and slow at the same time:
--   * The prefix came from the check-in day but the count window came from
--     `created_at`, so every booking made in advance for the same date counted
--     0 and produced `BK-<checkin>-001`. The second one hit the unique index on
--     booking_number and the guest was told the room had just been taken.
--   * A COUNT over a predicate takes a predicate lock under SERIALIZABLE, so
--     two bookings for *different rooms* could abort each other.
--
-- A single-row upsert is atomic, is one round trip, and never conflicts with a
-- booking for another day.
-- ============================================================

CREATE TABLE IF NOT EXISTS booking_counters (
    day      DATE    NOT NULL PRIMARY KEY,
    last_seq INTEGER NOT NULL DEFAULT 0
);

-- Continue from the highest suffix already issued for each date rather than
-- from zero, or the first booking after this migration would re-issue a number
-- that already exists. The day is read back out of the booking number itself,
-- because rows written by the admin walk-in route used the creation day as the
-- prefix while website rows used the check-in day. Anything not shaped like
-- BK-YYYYMMDD-N (the demo seed writes RC…) never collides and is skipped.
INSERT INTO booking_counters (day, last_seq)
SELECT to_date(split_part(booking_number, '-', 2), 'YYYYMMDD') AS day,
       MAX(split_part(booking_number, '-', 3)::int)             AS last_seq
FROM bookings
WHERE booking_number ~ '^BK-\d{8}-\d+$'
GROUP BY 1
ON CONFLICT (day) DO UPDATE
    SET last_seq = GREATEST(booking_counters.last_seq, EXCLUDED.last_seq);
