-- ============================================================
-- CONTACT INQUIRIES
--
-- `/api/contact` existed but was a stub: it validated the body, logged it,
-- and returned success — nothing was ever emailed or persisted, and there was
-- no `/contact` page or nav link to reach it in the first place (B-36). This
-- table gives the route somewhere durable to write a submission before the
-- (best-effort) staff-notification email; queryable with `npx prisma studio`
-- until there's a reason to build a dedicated admin panel for it.
-- ============================================================

-- CreateTable
CREATE TABLE "contact_inquiries" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contact_inquiries_created_at_idx" ON "contact_inquiries"("created_at");
