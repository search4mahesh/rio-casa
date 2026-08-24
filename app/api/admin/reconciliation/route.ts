import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { ok, fail } from "@/lib/api-response";
import { dateOnly, addMonths, propertyDayString, toDayString } from "@/lib/dates";
import { CHANNEL_PAID_SOURCES } from "@/lib/labels";

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
  // Default: the current month *at the property*. `new Date().getMonth()` asks
  // the server, which is UTC on Vercel — on the 1st of a month before 05:30 IST
  // that is still last month, and the desk would open the reconciliation to
  // the wrong period.
  const month = searchParams.get("month") || propertyDayString().slice(0, 7);

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return fail("Use YYYY-MM for month", 400);
  }

  // Calendar days against DATE columns — see lib/dates.ts. Local-midnight
  // bounds shifted the whole window a day earlier in IST, pulling the previous
  // month's last day into the report and dropping this month's.
  const from = dateOnly(`${month}-01`);
  const to = addMonths(from, 1);

  // ── Revenue received (money in) ───────────────────────────────
  //
  // This is the *cash* view: what this month's arrivals are actually owed to
  // us, booked whole to the month the guest checked in. `/admin/reports` answers
  // a different question — revenue *earned* per night across an arbitrary
  // window — so the two figures legitimately differ and are labelled apart in
  // the UI. What was wrong was dropping OTA stays: they sit at `pending`
  // forever because the guest paid the channel, so filtering on
  // `paid`/`cash` alone silently excluded them (B-35).
  const paidBookings = await prisma.booking.findMany({
    where: {
      checkIn: { gte: from, lt: to },
      status: { notIn: ["cancelled", "no_show"] },
      OR: [
        { paymentStatus: { in: ["paid", "cash"] } },
        { source: { in: [...CHANNEL_PAID_SOURCES] }, paymentStatus: "pending" },
      ],
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
    const day = toDayString(b.checkIn);
    dayRevenueMap.set(day, (dayRevenueMap.get(day) ?? 0) + b.totalAmount);
  }
  const dayExpenseMap = new Map<string, number>();
  for (const e of expenses) {
    const day = toDayString(e.date);
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
          checkIn: toDayString(b.checkIn),
          amount: b.totalAmount,
          source: SOURCE_LABEL[b.source] ?? b.source,
        })),
      },
      expenses: {
        total: expenseTotal,
        byCategory: expenseByCategory,
        items: expenses.map((e) => ({
          id: e.id,
          date: toDayString(e.date),
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
