import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { z } from "zod";
import { ok, fail, failValidation } from "@/lib/api-response";

const UpdateSchema = z.object({
  isActive: z.boolean().optional(),
  role: z.enum(["owner", "manager", "frontdesk", "housekeeping"]).optional(),
  name: z.string().min(2).optional(),
  phone: z.string().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, "owner");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return failValidation(parsed.error);

  const target = await prisma.staff.findUnique({
    where: { id },
    select: { id: true, role: true, isActive: true },
  });
  if (!target) return fail("Staff member not found", 404);

  // Never let the last owner be demoted or switched off.
  //
  // Both are one click in Setup → Hotel & Staff, and either one locks the
  // property out of that page for good: only an owner can promote anyone, and
  // there is no password reset or account recovery to climb back in with.
  // Now that a revoked session stops working on the next request rather than
  // at token expiry (B-60), an owner could do this to themselves and lose the
  // panel mid-session.
  const losingOwner =
    target.role === "owner" &&
    target.isActive &&
    ((parsed.data.role !== undefined && parsed.data.role !== "owner") ||
      parsed.data.isActive === false);

  if (losingOwner) {
    const otherOwners = await prisma.staff.count({
      where: { role: "owner", isActive: true, id: { not: target.id } },
    });
    if (otherOwners === 0) {
      return fail(
        "This is the only active owner. Promote another staff member to owner first.",
        400
      );
    }
  }

  const member = await prisma.staff.update({
    where: { id },
    data: parsed.data,
    select: { id: true, name: true, email: true, role: true, isActive: true },
  });

  return ok(member);
}
