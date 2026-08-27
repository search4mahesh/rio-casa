import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { requireRole } from "@/lib/api-auth";
import { ok, okEmpty, failValidation } from "@/lib/api-response";
import { dateOnly, isDayString } from "@/lib/dates";

const UpdateSchema = z.object({
  date: z.string().refine(isDayString, "Use a real date in YYYY-MM-DD form").optional(),
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
  const auth = await requireRole(req, "manager");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return failValidation(parsed.error);
  }

  const { date, ...rest } = parsed.data;
  const expense = await prisma.expense.update({
    where: { id: params.id },
    data: {
      ...rest,
      // `dateOnly`, not `new Date` — a DATE column wants a calendar day. Both
      // happen to agree for a bare YYYY-MM-DD, but only one says so.
      ...(date ? { date: dateOnly(date) } : {}),
    },
  });

  return ok(expense);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireRole(req, "manager");
  if (!auth.ok) return auth.response;

  await prisma.expense.delete({ where: { id: params.id } });
  return okEmpty();
}
