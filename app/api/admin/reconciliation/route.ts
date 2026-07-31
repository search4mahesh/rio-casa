import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { ok } from "@/lib/api-response";

const SOURCE_LABEL: Record<string, string> = {
  website: "Website",
  walkin: "Walk-in",
  phone: "Phone",
  booking_com: "Booking.com",
  mmt: "MakeMyTrip",
  goibibo: "Goibibo",
  airbnb: "Airbnb",
  other: "Other",
};

const CATEGORY_LABEL: Record<string, string> = {
  housekeeping: "Housekeeping",
  maintenance: "Maintenance",
  food: "Food & Beverage",
  utilities: "Utilities",
  staff: "Staff",
  marketing: "Marketing",
  other: "Other",
};

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "manager");
  if (!auth.ok) return auth.response;

  const { searchParams } = req.nextUrl;
  // Default: current month
  const today = new Date();
  const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const month = searchParams.get("month") || defaultMonth;

  const [year, mon] = month.split("-").map(Number);
  const from = new Date(year, mon - 1, 1);
  const to = new Date(year, mon, 1);

  // ── Revenue (money in) ────────────────────────────────────────
  const paidBookings = await prisma.booking.findMany({
    where: {
      checkIn: { gte: from, lt: to },
      paymentStatus: { in: ["paid", "cash"] },
      status: { notIn: ["cancelled", "no_show"] },
    },
    select: {
      totalAmount: true,
      source: true,
      checkIn: true,
      bookingNumber: true,
      guestName: true,
      room: { select: { name: true, roomNumber: true } },
    },
    orderBy: { checkIn: "asc" },
  });

  const revenueTotal = paidBookings.reduce((sum, b) => sum + b.totalAmount, 0);

  // By source
  const sourceMap = new Map<string, { amount: number; count: number }>();
  for (const b of paidBookings) {
    const src = b.source || "other";
    const existing = sourceMap.get(src) ?? { amount: 0, count: 0 };
    sourceMap.set(src, { amount: existing.amount + b.totalAmount, count: existing.count + 1 });
  }
  const revenueBySource = Array.from(sourceMap.entries()).map(([source, val]) => ({
    source,
    label: SOURCE_LABEL[source] ?? source,
    amount: val.amount,
    bookings: val.count,
  })).sort((a, b) => b.amount - a.amount);

  // ── Expenses (money out) ──────────────────────────────────────
  const expenses = await prisma.expense.findMany({
    where: { date: { gte: from, lt: to } },
    orderBy: { date: "asc" },
  });

  const expenseTotal = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

  // By category
  const catMap = new Map<string, number>();
  for (const e of expenses) {
    catMap.set(e.category, (catMap.get(e.category) ?? 0) + Number(e.amount));
  }
  const expenseByCategory = Array.from(catMap.entries()).map(([category, amount]) => ({
    category,
    label: CATEGORY_LABEL[category] ?? category,
    amount,
  })).sort((a, b) => b.amount - a.amount);

  // ── Daily breakdown ───────────────────────────────────────────
  const dayRevenueMap = new Map<string, number>();
  for (const b of paidBookings) {
    const day = b.checkIn.toISOString().slice(0, 10);
    dayRevenueMap.set(day, (dayRevenueMap.get(day) ?? 0) + b.totalAmount);
  }
  const dayExpenseMap = new Map<string, number>();
  for (const e of expenses) {
    const day = e.date.toISOString().slice(0, 10);
    dayExpenseMap.set(day, (dayExpenseMap.get(day) ?? 0) + Number(e.amount));
  }
  const allDays = new Set([...dayRevenueMap.keys(), ...dayExpenseMap.keys()]);
  const dailyBreakdown = Array.from(allDays).sort().map((day) => ({
    date: day,
    revenue: dayRevenueMap.get(day) ?? 0,
    expenses: dayExpenseMap.get(day) ?? 0,
  }));

  return ok({
      month,
      revenue: {
        total: revenueTotal,
        bySource: revenueBySource,
        bookings: paidBookings.map((b) => ({
          bookingNumber: b.bookingNumber,
          guestName: b.guestName,
          room: b.room.name + (b.room.roomNumber ? ` (${b.room.roomNumber})` : ""),
          checkIn: b.checkIn.toISOString().slice(0, 10),
          amount: b.totalAmount,
          source: SOURCE_LABEL[b.source] ?? b.source,
        })),
      },
      expenses: {
        total: expenseTotal,
        byCategory: expenseByCategory,
        items: expenses.map((e) => ({
          id: e.id,
          date: e.date.toISOString().slice(0, 10),
          category: e.category,
          categoryLabel: CATEGORY_LABEL[e.category] ?? e.category,
          description: e.description,
          vendor: e.vendor,
          amount: Number(e.amount),
          paymentMethod: e.paymentMethod,
        })),
      },
      net: revenueTotal - expenseTotal,
      dailyBreakdown,
    });
}
