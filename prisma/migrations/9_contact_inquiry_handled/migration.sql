-- ============================================================
-- CONTACT INQUIRY — HANDLED STATE
--
-- `5_contact_inquiries` gave `/api/contact` somewhere durable to write a
-- submission, and said it would be "queryable with npx prisma studio until
-- there's a reason to build a dedicated admin panel for it". There was one:
-- nothing in the application ever read the table (B-61), so staff saw an
-- inquiry only if the best-effort Resend notification happened to land. With
-- RESEND_API_KEY unset, or on any send failure, the row sat here unread while
-- the guest was told "We will contact you shortly."
--
-- A list alone would not have fixed that. An inbox nobody can mark off is one
-- every reader has to re-read from the top, so these two columns are what make
-- the panel a worklist rather than a log: `handled_at` is the flag, and
-- `handled_by` records who dealt with it so the desk can ask them.
-- ============================================================

ALTER TABLE "contact_inquiries" ADD COLUMN "handled_at" TIMESTAMP(3);
ALTER TABLE "contact_inquiries" ADD COLUMN "handled_by" TEXT;

-- The panel's default view is "still open", which is a query for NULL. Partial,
-- because rows matching it are the only ones that view ever wants and the
-- index stops growing the moment an inquiry is dealt with.
CREATE INDEX "contact_inquiries_open_idx"
  ON "contact_inquiries" ("created_at" DESC)
  WHERE "handled_at" IS NULL;
