import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyAdminToken, ADMIN_COOKIE } from "@/lib/admin-auth";

async function requireAuth(req: NextRequest) {
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  return token ? await verifyAdminToken(token) : null;
}

// GET /api/admin/rooms/status — all rooms with current status
export async function GET(req: NextRequest) {
  const staff = await requireAuth(req);
  if (!staff) return NextResponse.json({ success: false }, { status: 401 });

  const rooms = await prisma.room.findMany({
    where: { isActive: true },
    include: {
      roomStatus: {
        include: {
          currentGuest: { select: { firstName: true, lastName: true, phone: true } },
          currentBooking: { select: { checkOut: true, bookingNumber: true, adults: true } },
        },
      },
    },
    orderBy: [{ floor: "asc" }, { roomNumber: "asc" }],
  });

  return NextResponse.json({ success: true, rooms });
}

const PatchSchema = z.object({
  roomId: z.string(),
  occupancy: z.enum(["vacant", "occupied", "due_checkout", "due_checkin", "out_of_order"]).optional(),
  housekeeping: z.enum(["clean", "dirty", "cleaning", "inspected", "out_of_order"]).optional(),
  notes: z.string().optional(),
});

// PATCH /api/admin/rooms/status — update room occupancy / housekeeping
export async function PATCH(req: NextRequest) {
  const staff = await requireAuth(req);
  if (!staff) return NextResponse.json({ success: false }, { status: 401 });

  try {
    const body = await req.json();
    const { roomId, occupancy, housekeeping, notes } = PatchSchema.parse(body);

    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (occupancy !== undefined) update.occupancy = occupancy;
    if (housekeeping !== undefined) {
      update.housekeeping = housekeeping;
      if (housekeeping === "clean") {
        update.lastCleanedAt = new Date();
        update.cleanedBy = staff.name;
      }
    }
    if (notes !== undefined) update.notes = notes;

    const status = await prisma.roomStatus.upsert({
      where: { roomId },
      create: { roomId, ...update },
      update,
    });

    await prisma.auditLog.create({
      data: {
        userId: staff.staffId,
        action: "update_room_status",
        entityType: "room",
        entityId: roomId,
        newValue: update as Record<string, string | number | boolean | null>,
      },
    });

    return NextResponse.json({ success: true, status });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
