import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { requireRole } from "@/lib/api-auth";
import { ok, fail, failValidation } from "@/lib/api-response";
import { dateOnly, addMonths, isMonthString, isDayString } from "@/lib/dates";

const CreateSchema = z.object({
  date: z.string().refine(isDayString, "Invalid date"),
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
    // Calendar days against a DATE column — see lib/dates.ts. Local midnight
    // is `…T18:30:00Z` the previous day in IST, which Postgres truncates back
    // to that day: the August filter was showing a 31 July expense and hiding
    // a 31 August one. Writes already store UTC midnight, so the read bounds
    // were the half that disagreed.
    if (!isMonthString(month)) {
      return fail("Use YYYY-MM for month", 400);
    }
    const from = dateOnly(`${month}-01`);
    where.date = { gte: from, lt: addMonths(from, 1) };
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
      date: dateOnly(date),
      amount,
    },
  });

  return ok(expense, 201);
}
