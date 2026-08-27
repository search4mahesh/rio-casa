import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { ok, fail, failValidation } from "@/lib/api-response";

const UpdateSchema = z.object({
  handled: z.boolean(),
});

// PATCH /api/admin/inquiries/[id]
//
// Mark an inquiry dealt with, or put it back. Reversible on purpose: the
// alternative to an undo is a row that has silently left the only view anyone
// looks at, which is how B-61 felt from the desk in the first place.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, "frontdesk");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return failValidation(parsed.error);

  const existing = await prisma.contactInquiry.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) return fail("Inquiry not found", 404);

  const inquiry = await prisma.contactInquiry.update({
    where: { id },
    data: parsed.data.handled
      // Stamped from the row, not from the client: who marked it and when are
      // the two things a colleague needs in order to ask about it later.
      ? { handledAt: new Date(), handledBy: auth.staff.name }
      : { handledAt: null, handledBy: null },
  });

  return ok(inquiry);
}
