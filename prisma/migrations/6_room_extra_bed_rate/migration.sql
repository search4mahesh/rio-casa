-- An extra bed becomes a priced, capacity-bearing item.
--
-- `rooms.extra_bed` already existed as a boolean nothing priced: `quoteStay`
-- read `extraBedRate` only from a rate plan, and no rate plan exists, so every
-- extra bed was billed at zero. It also never counted toward occupancy, so a
-- party of 5 was told the property was full while five rooms sat empty (B-57).
--
-- This column is the tariff used when no rate plan covers the stay. A rate plan
-- with a non-zero `extra_bed_rate` still overrides it; a plan that leaves it at
-- 0 is treated as having no opinion rather than as "free", so creating a rate
-- plan can never silently give the bed away again.
ALTER TABLE "rooms" ADD COLUMN "extra_bed_rate" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Backfill. Every room in the property has extra_bed = true; ₹1,000/night is
-- the opening rate for all of them. There is no rooms admin panel yet, so this
-- is the one place the figure is set — change it here and in prisma/seed-rooms.ts
-- together, or a re-seed will silently revert it.
UPDATE "rooms" SET "extra_bed_rate" = 1000 WHERE "extra_bed" = true;
