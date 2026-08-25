import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { ok, fail, failValidation } from "@/lib/api-response";
import { dateOnly, addMonths, toDayString, isMonthString, isDayString } from "@/lib/dates";
import { nextDailyNumber } from "@/lib/booking-service";

const CreateSchema = z.object({
  sentDate: z.string().refine(isDayString, "Use YYYY-MM-DD"),
  vendorName: z.string().max(120).optional(),
  notes: z.string().max(500).optional(),
  items: z
    .array(
      z.object({
        linenItemId: z.string().min(1),
        qtySent: z.number().int().positive("Quantity must be at least 1"),
      })
    )
    .min(1, "Add at least one item"),
});

// GET /api/admin/laundry?status=&month=YYYY-MM
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "housekeeping");
  if (!auth.ok) return auth.response;

  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status");
  const month = searchParams.get("month");

  const where: Record<string, unknown> = {};
  if (status && status !== "all") {
    where.status = status === "outstanding" ? { in: ["sent", "partial"] } : status;
  }
  if (month) {
    // `sentDate` is a DATE column — see lib/dates.ts. Local-midnight bounds
    // put a batch dispatched on the 1st into the previous month's list.
    if (!isMonthString(month)) {
      return fail("Use YYYY-MM for month", 400);
    }
    const from = dateOnly(`${month}-01`);
    where.sentDate = { gte: from, lt: addMonths(from, 1) };
  }

  const batches = await prisma.laundryBatch.findMany({
    where,
    orderBy: [{ sentDate: "desc" }, { createdAt: "desc" }],
    include: {
      items: {
        include: { linenItem: { select: { id: true, name: true, category: true } } },
      },
    },
    take: 100,
  });

  // Anything still out is what the laundryman owes us, per item type.
  const openBatches = batches.filter((b) => b.status === "sent" || b.status === "partial");
  const outstanding: Record<string, { name: string; qty: number }> = {};
  for (const b of openBatches) {
    for (const it of b.items) {
      const pending = it.qtySent - it.qtyReturned - it.qtyDamaged;
      if (pending <= 0) continue;
      const row = (outstanding[it.linenItemId] ??= { name: it.linenItem.name, qty: 0 });
      row.qty += pending;
    }
  }

  return ok({
    batches: batches.map((b) => ({
      ...b,
      sentDate: toDayString(b.sentDate),
      returnedDate: b.returnedDate ? toDayString(b.returnedDate) : null,
      totalCost: Number(b.totalCost),
      items: b.items.map((it) => ({
        ...it,
        ratePerPiece: Number(it.ratePerPiece),
        qtyPending: it.qtySent - it.qtyReturned - it.qtyDamaged,
      })),
    })),
    outstanding: Object.entries(outstanding).map(([linenItemId, v]) => ({ linenItemId, ...v })),
    summary: {
      openBatches: openBatches.length,
      piecesOut: Object.values(outstanding).reduce((s, r) => s + r.qty, 0),
      // Cancelled batches never went out, so they never cost anything. They
      // stay in `batches` so staff can see what was voided, but billing a
      // batch that was entered by mistake would defeat cancelling it.
      totalCost: batches
        .filter((b) => b.status !== "cancelled")
        .reduce((s, b) => s + Number(b.totalCost), 0),
    },
  });
}

// POST /api/admin/laundry — dispatch a batch
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, "housekeeping");
  if (!auth.ok) return auth.response;
  const staff = auth.staff;

  const parsed = CreateSchema.safeParse(await req.json());
  if (!parsed.success) return failValidation(parsed.error);

  const { sentDate, vendorName, notes, items } = parsed.data;

  // Reject duplicate lines up front — the unique constraint would otherwise
  // fail mid-transaction with an opaque error.
  const ids = items.map((i) => i.linenItemId);
  if (new Set(ids).size !== ids.length) return fail("The same item is listed twice");

  const linenItems = await prisma.linenItem.findMany({ where: { id: { in: ids } } });
  if (linenItems.length !== ids.length) return fail("One or more items no longer exist");

  const rateOf = new Map(linenItems.map((l) => [l.id, Number(l.ratePerPiece)]));
  const totalPieces = items.reduce((s, i) => s + i.qtySent, 0);
  const totalCost = items.reduce((s, i) => s + i.qtySent * (rateOf.get(i.linenItemId) ?? 0), 0);

  // Atomic, via the same allocator booking numbers use. This was a `COUNT(*)`
  // of batches whose number starts with `LB-<day>`: two staff dispatching on
  // the same day read the same count, computed the same suffix, and the second
  // insert died on the unique index on `batch_number` — reaching housekeeping
  // as "Server error" with the linen already handed over. Exactly the race
  // 2_booking_counter was written to kill for bookings.
  const batchNumber = await nextDailyNumber("laundry", "LB", dateOnly(sentDate), 2);

  const batch = await prisma.laundryBatch.create({
    data: {
      batchNumber,
      sentDate: dateOnly(sentDate),
      vendorName: vendorName || null,
      notes: notes || null,
      sentBy: staff.name,
      status: "sent",
      totalPieces,
      totalCost,
      items: {
        create: items.map((i) => ({
          linenItemId: i.linenItemId,
          qtySent: i.qtySent,
          ratePerPiece: rateOf.get(i.linenItemId) ?? 0,
        })),
      },
    },
    include: { items: { include: { linenItem: true } } },
  });

  await prisma.auditLog.create({
    data: {
      userId: staff.staffId,
      action: "laundry_dispatched",
      entityType: "laundry_batch",
      entityId: batch.id,
      newValue: { batchNumber: batch.batchNumber, totalPieces, totalCost },
    },
  });

  return ok({ ...batch, totalCost: Number(batch.totalCost) }, 201);
}
