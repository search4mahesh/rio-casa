-- One reservation, several rooms.
--
-- A party of five does not fit in any room this property has (the largest
-- sleeps four, five with an extra bed), so the booking wizard offered them
-- nothing at all (B-57). Each room still gets its own `bookings` row — the
-- exclusion constraint, the night audit, housekeeping and every report are
-- per-room and stay untouched. The group owns only what the rooms share: the
-- Razorpay order, the promo claim, and the number the guest quotes.

CREATE TABLE "booking_groups" (
    "id"                  TEXT NOT NULL,
    "group_number"        TEXT NOT NULL,
    "guest_id"            TEXT,
    "total_amount"        DOUBLE PRECISION NOT NULL,
    "discount_amount"     DOUBLE PRECISION NOT NULL DEFAULT 0,
    "adults"              INTEGER NOT NULL DEFAULT 1,
    "children"            INTEGER NOT NULL DEFAULT 0,
    "razorpay_order_id"   TEXT,
    "razorpay_payment_id" TEXT,
    "promo_code"          TEXT,
    "source"              TEXT NOT NULL DEFAULT 'website',
    "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"          TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_groups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "booking_groups_group_number_key" ON "booking_groups"("group_number");

ALTER TABLE "booking_groups"
    ADD CONSTRAINT "booking_groups_guest_id_fkey"
    FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "bookings" ADD COLUMN "group_id" TEXT;

ALTER TABLE "bookings"
    ADD CONSTRAINT "bookings_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "booking_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Every read of a group walks from the group to its rooms.
CREATE INDEX "bookings_group_id_idx" ON "bookings"("group_id");

-- Existing bookings keep `group_id` NULL. They are single-room stays that were
-- never part of a party, and nothing reads the column for them: the group is an
-- addition to the booking flow, not a replacement for rows already written.
