import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAdminToken, ADMIN_COOKIE } from "@/lib/admin-auth";
import { z } from "zod";

const CreateSchema = z.object({
  roomId: z.string(),
  taskType: z.enum(["cleaning", "inspection", "maintenance", "turndown", "laundry"]),
  assignedTo: z.string().optional(),
  notes: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  const staff = token ? await verifyAdminToken(token) : null;
  if (!staff) return NextResponse.json({ success: false }, { status: 401 });

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
    return NextResponse.json({ success: true, count });
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

  return NextResponse.json({ success: true, tasks });
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  const staff = token ? await verifyAdminToken(token) : null;
  if (!staff) return NextResponse.json({ success: false }, { status: 401 });

  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });

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

  return NextResponse.json({ success: true, task });
}
