import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { okEmpty, fail } from "@/lib/api-response";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, "manager");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  try {
    await prisma.shiftAssignment.delete({ where: { id } });
    return okEmpty();
  } catch {
    return fail("Not found", 404);
  }
}
