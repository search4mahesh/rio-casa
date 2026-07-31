import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { ok, failValidation } from "@/lib/api-response";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, "frontdesk");
  if (!auth.ok) return auth.response;

  const { id } = await params;

  const guest = await prisma.guest.findUnique({
    where: { id },
    include: {
      bookings: {
        include: { room: { select: { name: true, roomNumber: true, roomType: true } } },
        orderBy: { checkIn: "desc" },
      },
      invoices: {
        select: { id: true, invoiceNumber: true, totalAmount: true, invoiceDate: true, status: true },
        orderBy: { invoiceDate: "desc" },
        take: 50,
      },
    },
  });

  if (!guest) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  return ok(guest);
}

const UpdateSchema = z.object({
  firstName: z.string().min(1).max(50).optional(),
  lastName: z.string().min(1).max(50).optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().min(6).max(20).optional(),
  altPhone: z.string().max(20).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  state: z.string().max(100).nullable().optional(),
  country: z.string().max(100).optional(),
  pincode: z.string().max(20).nullable().optional(),
  idProofType: z.string().max(50).nullable().optional(),
  idProofNumber: z.string().max(50).nullable().optional(),
  nationality: z.string().max(50).optional(),
  gstin: z.string().max(20).nullable().optional(),
  companyName: z.string().max(150).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, "frontdesk");
  if (!auth.ok) return auth.response;
  const staff = auth.staff;

  const { id } = await params;
  const body = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return failValidation(parsed.error);
  }

  try {
    const guest = await prisma.guest.update({ where: { id }, data: parsed.data });

    await prisma.auditLog.create({
      data: {
        userId: staff.staffId,
        action: "update_guest",
        entityType: "guest",
        entityId: id,
        newValue: parsed.data as Record<string, unknown> as never,
      },
    });

    return ok(guest);
  } catch {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
}
