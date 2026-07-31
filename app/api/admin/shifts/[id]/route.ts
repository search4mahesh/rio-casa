import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { okEmpty } from "@/lib/api-response";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, "manager");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  try {
    await prisma.shiftAssignment.delete({ where: { id } });
    return okEmpty();
  } catch {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
}
