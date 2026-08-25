import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { ok, fail, failValidation, okEmpty } from "@/lib/api-response";
import { dateOnly, isDayString } from "@/lib/dates";

const ReturnSchema = z.object({
  returnedDate: z.string().refine(isDayString, "Use YYYY-MM-DD"),
  notes: z.string().max(500).optional(),
  items: z
    .array(
      z.object({
        id: z.string().min(1),
        qtyReturned: z.number().int().min(0),
        qtyDamaged: z.number().int().min(0),
      })
    )
    .min(1),
});

// PATCH /api/admin/laundry/[id] — record what came back
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(req, "housekeeping");
  if (!auth.ok) return auth.response;
  const staff = auth.staff;

  const parsed = ReturnSchema.safeParse(await req.json());
  if (!parsed.success) return failValidation(parsed.error);

  const batch = await prisma.laundryBatch.findUnique({
    where: { id: params.id },
    include: { items: true },
  });
  if (!batch) return fail("Batch not found", 404);
  if (batch.status === "cancelled") return fail("This batch was cancelled", 409);

  const byId = new Map(batch.items.map((i) => [i.id, i]));

  // A line can never come back with more pieces than went out — that would
  // silently invent linen and make the outstanding count negative.
  for (const line of parsed.data.items) {
    const existing = byId.get(line.id);
    if (!existing) return fail("Unknown line item on this batch");
    if (line.qtyReturned + line.qtyDamaged > existing.qtySent) {
      return fail(
        `Returned + damaged (${line.qtyReturned + line.qtyDamaged}) exceeds the ${existing.qtySent} sent`
      );
    }
  }

  await prisma.$transaction(
    parsed.data.items.map((line) =>
      prisma.laundryBatchItem.update({
        where: { id: line.id },
        data: { qtyReturned: line.qtyReturned, qtyDamaged: line.qtyDamaged },
      })
    )
  );

  const updated = await prisma.laundryBatchItem.findMany({ where: { batchId: batch.id } });
  const fullyBack = updated.every((i) => i.qtyReturned + i.qtyDamaged >= i.qtySent);
  const anyBack = updated.some((i) => i.qtyReturned + i.qtyDamaged > 0);

  const result = await prisma.laundryBatch.update({
    where: { id: batch.id },
    data: {
      returnedDate: dateOnly(parsed.data.returnedDate),
      // "returned" means fully accounted for — pieces still missing keep the
      // batch open so they stay visible in the outstanding list.
      status: fullyBack ? "returned" : anyBack ? "partial" : "sent",
      receivedBy: staff.name,
      ...(parsed.data.notes ? { notes: parsed.data.notes } : {}),
    },
    include: { items: { include: { linenItem: true } } },
  });

  await prisma.auditLog.create({
    data: {
      userId: staff.staffId,
      action: "laundry_returned",
      entityType: "laundry_batch",
      entityId: batch.id,
      newValue: {
        batchNumber: batch.batchNumber,
        status: result.status,
        missing: updated.reduce((s, i) => s + (i.qtySent - i.qtyReturned - i.qtyDamaged), 0),
      },
    },
  });

  return ok({ ...result, totalCost: Number(result.totalCost) });
}

// DELETE /api/admin/laundry/[id] — cancel a batch entered by mistake
//
// Marks it `cancelled` rather than deleting the row. This used to call
// `prisma.laundryBatch.delete`, which cascaded the item lines away with it:
// the record of what physically went to the laundryman was gone, the
// `cancelled` status the PATCH above guards against was unreachable, and the
// audit row written here pointed at an `entityId` that no longer existed.
//
// Cancelled batches drop out of the outstanding count on their own — the list
// route builds it from `sent` and `partial` only.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(req, "manager");
  if (!auth.ok) return auth.response;

  const batch = await prisma.laundryBatch.findUnique({ where: { id: params.id } });
  if (!batch) return fail("Batch not found", 404);
  if (batch.status === "cancelled") return fail("This batch is already cancelled", 409);

  // A batch the laundryman has already returned pieces against is a real
  // event, not a typo. Cancelling it would drop those returns out of the
  // record while the linen is back on the shelf.
  if (batch.status === "returned" || batch.status === "partial") {
    return fail(
      `Cannot cancel a batch that has already been ${batch.status === "returned" ? "returned" : "partially returned"}`,
      409
    );
  }

  await prisma.laundryBatch.update({
    where: { id: params.id },
    data: { status: "cancelled" },
  });

  await prisma.auditLog.create({
    data: {
      userId: auth.staff.staffId,
      action: "laundry_batch_cancelled",
      entityType: "laundry_batch",
      entityId: params.id,
      oldValue: { batchNumber: batch.batchNumber, totalPieces: batch.totalPieces, status: batch.status },
      newValue: { status: "cancelled" },
    },
  });

  return okEmpty();
}
