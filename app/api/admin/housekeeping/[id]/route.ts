import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { requireAuth } from "@/lib/api-auth";
import { ok, fail } from "@/lib/api-response";

const UpdateSchema = z.object({
  status: z.enum(["pending", "in_progress", "completed", "cancelled"]).optional(),
  assignedTo: z.string().optional(),
  notes: z.string().optional(),
  maintenanceFlag: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return fail("Invalid input", 400);

  const now = new Date();
  const update: Record<string, unknown> = { ...parsed.data };

  if (parsed.data.status === "in_progress") update.startedAt = now;
  if (parsed.data.status === "completed") update.completedAt = now;

  const task = await prisma.housekeepingLog.update({
    where: { id },
    data: update,
    include: { room: { select: { name: true, roomNumber: true } } },
  });

  return ok(task);
}
