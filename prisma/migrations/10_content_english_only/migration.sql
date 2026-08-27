-- ============================================================
-- CONTENT TABLES ARE ENGLISH-ONLY
--
-- `packages` carries `name_hi`, `name_mr`, `desc_hi` and `desc_mr`, all NOT
-- NULL, and `blog_posts` carries nullable equivalents. This site is
-- English-only by decision, not by omission: `middleware.ts` registers
-- `locales: ["en"]`, `i18n.ts` always loads `en.json`, and `/hi` and `/mr` 404
-- on purpose (see CLAUDE.md). next-intl is kept purely as the string store.
--
-- Nothing has ever read those columns, and nothing can: there is no route that
-- would serve them. But while they are NOT NULL, every insert has to invent a
-- Hindi and a Marathi translation for copy that will only ever be shown in
-- English — which is what stood between these tables and the site actually
-- reading them (B-53).
--
-- Made nullable rather than dropped. The existing values are real translations
-- someone wrote, `DROP COLUMN` would discard them irreversibly, and nullable
-- is enough to unblock the content model. Dropping them is a decision for
-- whoever is sure the property will never want a second locale — and the
-- committed position is that it will not, so this is a candidate for removal
-- later, not something to keep filling in.
-- ============================================================

ALTER TABLE "packages" ALTER COLUMN "name_hi" DROP NOT NULL;
ALTER TABLE "packages" ALTER COLUMN "name_mr" DROP NOT NULL;
ALTER TABLE "packages" ALTER COLUMN "desc_hi" DROP NOT NULL;
ALTER TABLE "packages" ALTER COLUMN "desc_mr" DROP NOT NULL;

-- Packages are looked up and upserted by name; nothing enforced that, so the
-- demo seed created a fresh row every run and left 4 copies of each of the 3
-- packages (B-54 fixed the seed, not the rows). A content table the site reads
-- must not be able to hold two rows claiming to be the same package at two
-- different prices.
DELETE FROM "packages" a USING "packages" b
  WHERE a."name_en" = b."name_en" AND a."created_at" > b."created_at";
CREATE UNIQUE INDEX "packages_name_en_key" ON "packages" ("name_en");

-- Same story: 6 testimonials, 4 copies each.
DELETE FROM "testimonials" a USING "testimonials" b
  WHERE a."guest_name" = b."guest_name" AND a."review" = b."review" AND a."created_at" > b."created_at";

-- The site shows approved testimonials, newest stay first.
CREATE INDEX "testimonials_approved_idx" ON "testimonials" ("is_approved", "stay_date" DESC);

-- Published posts, newest first — the blog index's only query.
CREATE INDEX "blog_posts_published_idx" ON "blog_posts" ("is_published", "published_at" DESC);

-- The gallery renders in explicit order within a category.
CREATE INDEX "gallery_images_category_sort_idx" ON "gallery_images" ("category", "sort_order");

-- `blog_posts` could not represent what the blog index actually renders: the
-- hardcoded `BLOG_POSTS` carry an excerpt, a category and a read time, and the
-- table had columns for none of them. Migrating the blog to the database
-- without these would have meant quietly dropping three fields from every card
-- — the kind of "fix" that makes a page worse.
ALTER TABLE "blog_posts" ADD COLUMN "excerpt" TEXT;
ALTER TABLE "blog_posts" ADD COLUMN "category" TEXT;

-- Read time is derived from the body at render, not stored: it is a function
-- of the words already in the row, and a stored copy is one more thing that
-- can disagree with them after an edit.
