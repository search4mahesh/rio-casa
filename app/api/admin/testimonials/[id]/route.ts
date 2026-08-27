import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { ok, fail, failValidation } from "@/lib/api-response";

const UpdateSchema = z.object({ isApproved: z.boolean() });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, "manager");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return failValidation(parsed.error);

  const existing = await prisma.testimonial.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return fail("Testimonial not found", 404);

  const updated = await prisma.testimonial.update({
    where: { id },
    data: { isApproved: parsed.data.isApproved },
  });

  return ok(updated);
}
