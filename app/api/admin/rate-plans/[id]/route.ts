import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyAdminToken, ADMIN_COOKIE } from "@/lib/admin-auth";
import { hasMinRole, forbidden } from "@/lib/rbac";

const UpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  roomType: z.enum(["deluxe", "premium", "family", "all"]).optional(),
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
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  const staff = token ? await verifyAdminToken(token) : null;
  if (!staff) return NextResponse.json({ success: false }, { status: 401 });
  if (!hasMinRole(staff.role, "manager")) return forbidden("manager");

  const { id } = await params;
  const body = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { validFrom, validTo, ...rest } = parsed.data;
  const data: Record<string, unknown> = { ...rest };
  if (validFrom) data.validFrom = new Date(validFrom);
  if (validTo) data.validTo = new Date(validTo);

  try {
    const plan = await prisma.ratePlan.update({ where: { id }, data });
    return NextResponse.json({ success: true, plan });
  } catch {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  const staff = token ? await verifyAdminToken(token) : null;
  if (!staff) return NextResponse.json({ success: false }, { status: 401 });
  if (!hasMinRole(staff.role, "manager")) return forbidden("manager");

  const { id } = await params;
  try {
    await prisma.ratePlan.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
}
