import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { ok, fail, failValidation } from "@/lib/api-response";
import { dateOnly, isDayString } from "@/lib/dates";

// PATCH /api/admin/packages/[id]
//
// Editing a package price used to be a code change and a deploy (B-53). The
// fields here are the ones that actually change between seasons — price,
// whether it is on offer, and the window it runs in.
const UpdateSchema = z.object({
  price: z.number().positive().max(1_000_000).optional(),
  isActive: z.boolean().optional(),
  // `YYYY-MM-DD`, validated with `isDayString` rather than a regex: a bare
  // `/^\d{4}-\d{2}-\d{2}$/` accepts `2026-02-30`, which `dateOnly` then
  // rejects — a 500 where a 400 belongs (B-45). `null` clears the window,
  // which is how a package becomes year-round.
  validFrom: z.string().refine(isDayString, "Use YYYY-MM-DD").nullable().optional(),
  validTo: z.string().refine(isDayString, "Use YYYY-MM-DD").nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, "manager");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return failValidation(parsed.error);

  const existing = await prisma.package.findUnique({ where: { id }, select: { validFrom: true, validTo: true } });
  if (!existing) return fail("Package not found", 404);

  const { price, isActive } = parsed.data;
  // `dateOnly`, never `new Date(y, m, d)` — these are @db.Date columns, and a
  // Date built from local parts is the previous day once Postgres truncates it
  // in IST (see the DATE-column section in CLAUDE.md).
  const validFrom =
    parsed.data.validFrom === undefined ? existing.validFrom
    : parsed.data.validFrom === null ? null
    : dateOnly(parsed.data.validFrom);
  const validTo =
    parsed.data.validTo === undefined ? existing.validTo
    : parsed.data.validTo === null ? null
    : dateOnly(parsed.data.validTo);

  // A window that ends before it starts hides the package from the site with
  // no indication why — the public reader simply never matches it.
  if (validFrom && validTo && validTo < validFrom) {
    return fail("Valid To must be on or after Valid From", 400);
  }

  const updated = await prisma.package.update({
    where: { id },
    data: {
      ...(price !== undefined ? { price } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      validFrom,
      validTo,
    },
  });

  return ok(updated);
}
