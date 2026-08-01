-- ============================================================
-- DOUBLE BOOKING PREVENTION — Database Level (Layer 1)
--
-- These objects cannot be expressed in schema.prisma, so they live here.
-- Previously they sat in prisma/add_exclusion_constraint.sql and had to be
-- applied by hand with psql, which meant a fresh database silently came up
-- WITHOUT the guard — the one protection no application bug can bypass.
-- ============================================================

-- Required for exclusion constraints on non-geometric types.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Blocks overlapping date ranges for the same room in a single SQL statement.
-- Only active bookings count; cancelled, no_show and failed-payment rows are ignored,
-- which is what lets those rows stay in the table as an audit trail.
ALTER TABLE bookings
DROP CONSTRAINT IF EXISTS no_overlapping_bookings;

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

-- Availability queries (checkAvailability + getAvailableRooms).
CREATE INDEX IF NOT EXISTS idx_bookings_availability
ON bookings (room_id, check_in, check_out, status, payment_status)
WHERE status NOT IN ('cancelled', 'no_show') AND payment_status != 'failed';

-- Channel sync polling.
CREATE INDEX IF NOT EXISTS idx_bookings_source
ON bookings (source, created_at DESC);

-- Guest lookups (createBooking matches returning guests on phone).
CREATE INDEX IF NOT EXISTS idx_guests_phone ON guests (phone);
CREATE INDEX IF NOT EXISTS idx_guests_email ON guests (email) WHERE email IS NOT NULL;

-- Housekeeping board.
CREATE INDEX IF NOT EXISTS idx_room_status_housekeeping
ON room_status (housekeeping, occupancy);
