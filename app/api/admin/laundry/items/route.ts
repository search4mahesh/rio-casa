import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { ok, failValidation } from "@/lib/api-response";

const UpdateSchema = z.object({
  id: z.string().min(1),
  ratePerPiece: z.number().min(0).optional(),
  isActive: z.boolean().optional(),
});

// GET /api/admin/laundry/items — the linen catalogue for the dispatch form
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "housekeeping");
  if (!auth.ok) return auth.response;

  const items = await prisma.linenItem.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  return ok(items.map((i) => ({ ...i, ratePerPiece: Number(i.ratePerPiece) })));
}

// PATCH /api/admin/laundry/items — change a rate. Manager-only: rates drive
// what the laundry bill totals to.
export async function PATCH(req: NextRequest) {
  const auth = await requireRole(req, "manager");
  if (!auth.ok) return auth.response;

  const parsed = UpdateSchema.safeParse(await req.json());
  if (!parsed.success) return failValidation(parsed.error);

  const { id, ...data } = parsed.data;
  const item = await prisma.linenItem.update({ where: { id }, data });

  return ok({ ...item, ratePerPiece: Number(item.ratePerPiece) });
}
