import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { ok, fail, failValidation } from "@/lib/api-response";
import { revalidateTag } from "next/cache";
import { TESTIMONIALS_TAG } from "@/lib/content-cache";

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

  // The home page serves testimonials from a cache with a one-minute TTL. This
  // is the only writer in the application, so it is also the only place that
  // can turn "approved" into "visible" immediately rather than within the
  // minute — which is what a manager pressing Approve and then looking at the
  // site expects. Without it the panel would appear not to have worked.
  revalidateTag(TESTIMONIALS_TAG);

  return ok(updated);
}
