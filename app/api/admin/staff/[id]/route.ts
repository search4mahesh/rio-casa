import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAdminToken, ADMIN_COOKIE } from "@/lib/admin-auth";
import { z } from "zod";

const UpdateSchema = z.object({
  isActive: z.boolean().optional(),
  role: z.enum(["owner", "manager", "frontdesk", "housekeeping"]).optional(),
  name: z.string().min(2).optional(),
  phone: z.string().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  const me = token ? await verifyAdminToken(token) : null;
  if (!me || me.role !== "owner") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });

  const member = await prisma.staff.update({
    where: { id },
    data: parsed.data,
    select: { id: true, name: true, email: true, role: true, isActive: true },
  });

  return NextResponse.json({ success: true, staff: member });
}
