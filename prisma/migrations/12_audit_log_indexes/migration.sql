-- ============================================================
-- AUDIT LOG — INDEXES
--
-- `audit_log` has been written by seventeen code paths since 0_init and read
-- by none, so nobody noticed it carried no index but its primary key. The
-- activity log at /admin/setup?tab=audit reads it newest-first, optionally
-- narrowed to one staff member, which without these is a sequential scan plus
-- a sort over every row the application has ever written — a cost that grows
-- with the age of the property and never comes back down.
--
-- DESC to match the query's ORDER BY exactly, so Postgres can walk the index
-- rather than scan and re-sort.
-- ============================================================

CREATE INDEX "audit_log_created_at_idx"
  ON "audit_log" ("created_at" DESC);

-- The per-staff view: "everything this person did", newest first. The leading
-- column makes it usable for the filtered query while the trailing one keeps
-- the ordering free.
CREATE INDEX "audit_log_user_id_created_at_idx"
  ON "audit_log" ("user_id", "created_at" DESC);
