import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { ok, fail } from "@/lib/api-response";
import { positiveIntParam } from "@/lib/query-params";
import { isDayString, propertyDayStartInstant, dayAfter } from "@/lib/dates";
import { SYSTEM_ACTOR, AUDIT_ACTION, NOTABLE_ACTIONS, type AuditCategory } from "@/lib/labels";

/**
 * GET /api/admin/audit — the activity log.
 *
 * `owner`, and deliberately the only route in the application gated that high
 * apart from staff administration. Every other admin surface tops out at
 * `manager`, but a manager is inside the group this view exists to oversee;
 * letting them read — and therefore know the coverage of — their own audit
 * trail defeats the point of keeping one.
 *
 * Read-only by construction. There is no POST, PATCH or DELETE here and there
 * should never be one: an audit trail that can be edited is not evidence, and
 * that holds for an owner as much as anyone. Rows leave only by whatever
 * retention policy the property later adopts, never through the application.
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "owner");
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;

  // Never `parseInt` — NaN propagates into `skip`/`take` and reaches Prisma as
  // an empty 500 (B-41). Capped so a hand-typed pageSize cannot pull the whole
  // table into memory.
  const page = positiveIntParam(sp.get("page"), 1);
  const pageSize = positiveIntParam(sp.get("pageSize"), 50, 200);

  const where: {
    userId?: string | { not: string };
    action?: string | { in: string[] };
    createdAt?: { gte?: Date; lt?: Date };
  } = {};

  // ── Who ──────────────────────────────────────────────────────────────────
  // "staff" (the default) hides automated and guest-driven writes. A single
  // website booking audits `booking_created` and often `payment_received`
  // under SYSTEM_ACTOR, so on a busy week they outnumber staff actions many
  // times over and bury the thing an owner opened this screen to find.
  const actor = sp.get("actor") ?? "staff";
  const staffId = sp.get("staffId");
  if (staffId) {
    where.userId = staffId;
  } else if (actor === "staff") {
    where.userId = { not: SYSTEM_ACTOR };
  } else if (actor === "system") {
    where.userId = SYSTEM_ACTOR;
  } else if (actor !== "all") {
    return fail("actor must be staff, system or all", 400);
  }

  // ── What ─────────────────────────────────────────────────────────────────
  const action = sp.get("action");
  const category = sp.get("category");
  if (action) {
    where.action = action;
  } else if (category === "notable") {
    where.action = { in: NOTABLE_ACTIONS };
  } else if (category) {
    const inCategory = Object.entries(AUDIT_ACTION)
      .filter(([, meta]) => meta.category === (category as AuditCategory))
      .map(([name]) => name);
    if (inCategory.length === 0) return fail("Unknown category", 400);
    where.action = { in: inCategory };
  }

  // ── When ─────────────────────────────────────────────────────────────────
  // `created_at` is a timestamp, not a `@db.Date` column, so the bounds are
  // property-local midnights expressed as instants — see propertyDayStartInstant.
  // `dateOnly` here would silently drop everything logged before 05:30 IST.
  const from = sp.get("from");
  const to = sp.get("to");
  if (from && !isDayString(from)) return fail("from must be YYYY-MM-DD", 400);
  if (to && !isDayString(to)) return fail("to must be YYYY-MM-DD", 400);
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = propertyDayStartInstant(from);
    // Half-open on the day *after* `to`, so a `to` of today includes today.
    if (to) where.createdAt.lt = propertyDayStartInstant(dayAfter(to));
  }

  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  // `audit_log.user_id` is a plain column, not a foreign key — an audit row
  // must outlive the account that wrote it, and a FK would either block the
  // staff delete or cascade the evidence away with it. So names are resolved
  // separately, and a missing one is rendered rather than dropped.
  const staffIds = [...new Set(entries.map((e) => e.userId))].filter((id) => id !== SYSTEM_ACTOR);
  const staff = staffIds.length
    ? await prisma.staff.findMany({
        where: { id: { in: staffIds } },
        select: { id: true, name: true, role: true },
      })
    : [];
  const byId = new Map(staff.map((s) => [s.id, s]));

  return ok({
    entries: entries.map((e) => ({
      id: e.id,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId,
      oldValue: e.oldValue,
      newValue: e.newValue,
      ipAddress: e.ipAddress,
      createdAt: e.createdAt,
      actor:
        e.userId === SYSTEM_ACTOR
          ? { id: SYSTEM_ACTOR, name: null, role: null }
          : {
              id: e.userId,
              name: byId.get(e.userId)?.name ?? null,
              role: byId.get(e.userId)?.role ?? null,
            },
    })),
    total,
    page,
    pageSize,
  });
}
