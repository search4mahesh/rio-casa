import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { requireAuth } from "@/lib/api-auth";
import { ok, fail } from "@/lib/api-response";

const CreateSchema = z.object({
  roomId: z.string(),
  taskType: z.enum(["cleaning", "inspection", "maintenance", "turndown", "laundry"]),
  assignedTo: z.string().optional(),
  notes: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status");
  const roomId = searchParams.get("roomId");
  const maintenance = searchParams.get("maintenance");
  const maintenanceCount = searchParams.get("maintenanceCount");

  // Fast count query used by the sidebar badge
  if (maintenanceCount === "true") {
    const count = await prisma.housekeepingLog.count({
      where: { maintenanceFlag: true, status: { not: "completed" } },
    });
    return ok(count);
  }

  const where: Record<string, unknown> = {};
  if (maintenance === "true") {
    where.maintenanceFlag = true;
    where.status = { not: "completed" };
  } else {
    if (status && status !== "all") where.status = status;
  }
  if (roomId) where.roomId = roomId;

  const tasks = await prisma.housekeepingLog.findMany({
    where,
    include: { room: { select: { name: true, roomNumber: true, floor: true } } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
  });

  return ok(tasks);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return fail("Invalid input", 400);

  const task = await prisma.housekeepingLog.create({
    data: {
      roomId: parsed.data.roomId,
      taskType: parsed.data.taskType,
      assignedTo: parsed.data.assignedTo,
      notes: parsed.data.notes,
      status: "pending",
    },
    include: { room: { select: { name: true, roomNumber: true } } },
  });

  return ok(task);
}
