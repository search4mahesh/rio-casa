import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { ok, okEmpty, failValidation, fail } from "@/lib/api-response";
import { isDayString } from "@/lib/dates";

const UpdateSchema = z.object({
  name: z.string().max(100).optional(),
  discountType: z.enum(["percentage", "flat"]).optional(),
  discountValue: z.number().positive().optional(),
  maxDiscount: z.number().positive().nullable().optional(),
  validFrom: z.string().refine(isDayString, "Use a real date in YYYY-MM-DD form").optional(),
  validTo: z.string().refine(isDayString, "Use a real date in YYYY-MM-DD form").optional(),
  minNights: z.number().int().min(1).optional(),
  minAmount: z.number().min(0).optional(),
  usageLimit: z.number().int().positive().nullable().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, "manager");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return failValidation(parsed.error);
  }

  const { validFrom, validTo, ...rest } = parsed.data;
  const data: Record<string, unknown> = { ...rest };
  if (validFrom) data.validFrom = new Date(validFrom);
  if (validTo) data.validTo = new Date(validTo);

  try {
    const promo = await prisma.promotion.update({ where: { id }, data });
    return ok(promo);
  } catch {
    return fail("Not found", 404);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, "manager");
  if (!auth.ok) return auth.response;

  const { id } = await params;

  // Only allow deleting if code has never been used
  try {
    const promo = await prisma.promotion.findUnique({ where: { id }, select: { usedCount: true } });
    if (!promo) return fail("Not found", 404);
    if (promo.usedCount > 0) {
      return fail("Cannot delete a promo code that has been used", 409);
    }
    await prisma.promotion.delete({ where: { id } });
    return okEmpty();
  } catch {
    return fail("Not found", 404);
  }
}
