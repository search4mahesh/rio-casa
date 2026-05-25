-- ============================================================
-- DOUBLE BOOKING PREVENTION — Database Level (Layer 1)
-- Run this AFTER: npx prisma migrate dev --name init
--
-- Command:
--   psql $DATABASE_URL -f prisma/add_exclusion_constraint.sql
--
-- What it does: makes it physically impossible to INSERT two
-- overlapping bookings for the same room in a single SQL statement.
-- No application bug can bypass this.
-- ============================================================

-- Step 1: Enable btree_gist extension (required for non-geometric exclusion constraints)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Step 2: Exclusion constraint — blocks overlapping date ranges per room
-- Only active bookings count; cancelled, no_show, and failed-payment rows are ignored.
ALTER TABLE bookings
ADD CONSTRAINT no_overlapping_bookings
EXCLUDE USING gist (
    room_id            WITH =,
    daterange(check_in, check_out) WITH &&
)
WHERE (
    status         NOT IN ('cancelled', 'no_show')
    AND payment_status != 'failed'
);

-- Step 3: Index for fast availability queries (used by checkAvailability + getAvailableRooms)
CREATE INDEX IF NOT EXISTS idx_bookings_availability
ON bookings (room_id, check_in, check_out, status, payment_status)
WHERE status NOT IN ('cancelled', 'no_show') AND payment_status != 'failed';

-- Step 4: Index for channel sync polling
CREATE INDEX IF NOT EXISTS idx_bookings_source
ON bookings (source, created_at DESC);

-- Step 5: Index for guest lookups
CREATE INDEX IF NOT EXISTS idx_guests_phone ON guests (phone);
CREATE INDEX IF NOT EXISTS idx_guests_email ON guests (email) WHERE email IS NOT NULL;

-- Step 6: Index for housekeeping board
CREATE INDEX IF NOT EXISTS idx_room_status_housekeeping
ON room_status (housekeeping, occupancy);

-- Step 7: Verify constraint was created
SELECT conname, contype
FROM pg_constraint
WHERE conname = 'no_overlapping_bookings';
-- Expected output: no_overlapping_bookings | x
