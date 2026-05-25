import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAdminToken, ADMIN_COOKIE } from "@/lib/admin-auth";
import { z } from "zod";

const UpdateSchema = z.object({
  status: z.enum(["pending", "in_progress", "completed", "cancelled"]).optional(),
  assignedTo: z.string().optional(),
  notes: z.string().optional(),
  maintenanceFlag: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  const staff = token ? await verifyAdminToken(token) : null;
  if (!staff) return NextResponse.json({ success: false }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });

  const now = new Date();
  const update: Record<string, unknown> = { ...parsed.data };

  if (parsed.data.status === "in_progress") update.startedAt = now;
  if (parsed.data.status === "completed") update.completedAt = now;

  const task = await prisma.housekeepingLog.update({
    where: { id },
    data: update,
    include: { room: { select: { name: true, roomNumber: true } } },
  });

  return NextResponse.json({ success: true, task });
}
