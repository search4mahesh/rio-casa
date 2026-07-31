import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { requireRole } from "@/lib/api-auth";
import { ok, failValidation } from "@/lib/api-response";

const CreateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  category: z.enum(["housekeeping", "maintenance", "food", "utilities", "staff", "marketing", "other"]),
  description: z.string().min(1),
  amount: z.number().positive(),
  paymentMethod: z.enum(["cash", "bank", "upi", "cheque"]),
  vendor: z.string().optional(),
  reference: z.string().optional(),
  recordedBy: z.string().min(1),
});

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "manager");
  if (!auth.ok) return auth.response;

  const { searchParams } = req.nextUrl;
  const month = searchParams.get("month"); // YYYY-MM
  const category = searchParams.get("category");

  const where: Record<string, unknown> = {};

  if (month) {
    const [year, mon] = month.split("-").map(Number);
    const from = new Date(year, mon - 1, 1);
    const to = new Date(year, mon, 1);
    where.date = { gte: from, lt: to };
  }

  if (category && category !== "all") where.category = category;

  const expenses = await prisma.expense.findMany({
    where,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  const total = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

  return ok({ expenses, total });
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, "manager");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return failValidation(parsed.error);
  }

  const { date, amount, ...rest } = parsed.data;
  const expense = await prisma.expense.create({
    data: {
      ...rest,
      date: new Date(date),
      amount,
    },
  });

  return ok(expense, 201);
}
