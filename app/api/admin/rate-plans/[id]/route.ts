import { NextRequest, NextResponse } from "next/server";
import { RATE_PLAN_ROOM_TYPES } from "@/lib/labels";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { ok, okEmpty, failValidation } from "@/lib/api-response";

const UpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  roomType: z.enum(RATE_PLAN_ROOM_TYPES).optional(),
  baseRate: z.number().positive().optional(),
  extraBedRate: z.number().min(0).optional(),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  validTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  weekendMarkup: z.number().min(0).max(100).optional(),
  minNights: z.number().int().min(1).optional(),
  priority: z.number().int().min(0).optional(),
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
    const plan = await prisma.ratePlan.update({ where: { id }, data });
    return ok(plan);
  } catch {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, "manager");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  try {
    await prisma.ratePlan.delete({ where: { id } });
    return okEmpty();
  } catch {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
}
