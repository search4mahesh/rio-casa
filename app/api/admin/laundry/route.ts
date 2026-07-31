import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { ok, fail, failValidation } from "@/lib/api-response";

const CreateSchema = z.object({
  sentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
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
    const [y, m] = month.split("-").map(Number);
    where.sentDate = { gte: new Date(y, m - 1, 1), lt: new Date(y, m, 1) };
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
      sentDate: b.sentDate.toISOString().slice(0, 10),
      returnedDate: b.returnedDate ? b.returnedDate.toISOString().slice(0, 10) : null,
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
      totalCost: batches.reduce((s, b) => s + Number(b.totalCost), 0),
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

  const day = sentDate.replace(/-/g, "");
  const sameDay = await prisma.laundryBatch.count({
    where: { batchNumber: { startsWith: `LB-${day}` } },
  });

  const batch = await prisma.laundryBatch.create({
    data: {
      batchNumber: `LB-${day}-${String(sameDay + 1).padStart(2, "0")}`,
      sentDate: new Date(sentDate),
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
