import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAdminToken, ADMIN_COOKIE } from "@/lib/admin-auth";
import { z } from "zod";

const UpdateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  category: z.enum(["housekeeping", "maintenance", "food", "utilities", "staff", "marketing", "other"]).optional(),
  description: z.string().min(1).optional(),
  amount: z.number().positive().optional(),
  paymentMethod: z.enum(["cash", "bank", "upi", "cheque"]).optional(),
  vendor: z.string().optional(),
  reference: z.string().optional(),
  recordedBy: z.string().min(1).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  const staff = token ? await verifyAdminToken(token) : null;
  if (!staff) return NextResponse.json({ success: false }, { status: 401 });

  const body = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.flatten() }, { status: 400 });
  }

  const { date, ...rest } = parsed.data;
  const expense = await prisma.expense.update({
    where: { id: params.id },
    data: {
      ...rest,
      ...(date ? { date: new Date(date) } : {}),
    },
  });

  return NextResponse.json({ success: true, data: expense });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  const staff = token ? await verifyAdminToken(token) : null;
  if (!staff) return NextResponse.json({ success: false }, { status: 401 });

  await prisma.expense.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
