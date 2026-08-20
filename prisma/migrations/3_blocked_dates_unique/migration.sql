-- ============================================================
-- ONE BLOCK PER ROOM PER DAY
--
-- `POST /api/admin/blocked-dates` expands a range into one row per day and
-- inserted them with a bare `createMany`. Nothing stopped the same day being
-- blocked twice — a double-clicked button, or two staff acting on the same
-- phone call, produced duplicate rows.
--
-- That is not merely untidy. The unblock UI deletes by `id`, so removing the
-- row staff can see leaves the other one in place and the room stays blocked.
-- To the person who just clicked "Unblock" it looks like the button is broken.
--
-- Two partial indexes rather than one plain UNIQUE, because `room_id` is
-- nullable (NULL means "every room") and Postgres treats NULLs as distinct in a
-- normal unique index — property-wide blocks would still duplicate freely.
--
-- Prisma cannot express partial indexes in schema.prisma, so like the
-- exclusion constraint in 1_double_booking_guard these live only here. See the
-- Migrations section of CLAUDE.md.
-- ============================================================

-- Collapse any duplicates already in the table, keeping the earliest row of
-- each group so the `created_at` history stays honest. Must run before the
-- indexes, which would otherwise fail to build.
DELETE FROM blocked_dates a
      USING blocked_dates b
      WHERE a.ctid > b.ctid
        AND a.block_date = b.block_date
        AND a.room_id IS NOT DISTINCT FROM b.room_id;

-- Per-room blocks.
CREATE UNIQUE INDEX IF NOT EXISTS blocked_dates_room_day_key
    ON blocked_dates (room_id, block_date)
 WHERE room_id IS NOT NULL;

-- Property-wide blocks (room_id IS NULL).
CREATE UNIQUE INDEX IF NOT EXISTS blocked_dates_property_day_key
    ON blocked_dates (block_date)
 WHERE room_id IS NULL;
