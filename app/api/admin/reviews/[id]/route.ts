import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { ok, okEmpty, failValidation } from "@/lib/api-response";

const UpdateSchema = z.object({
  responded: z.boolean().optional(),
  rating: z.number().int().min(1).max(5).optional(),
  reviewText: z.string().min(1).max(5000).optional(),
  reviewUrl: z.string().url().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
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

  const update: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.responded === true) update.respondedAt = new Date();
  if (parsed.data.responded === false) update.respondedAt = null;

  try {
    const review = await prisma.reviewLog.update({ where: { id }, data: update });
    return ok(review);
  } catch {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, "manager");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  try {
    await prisma.reviewLog.delete({ where: { id } });
    return okEmpty();
  } catch {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
}
