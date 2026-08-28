import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { okEmpty, fail } from "@/lib/api-response";
import { clientIp } from "@/lib/rate-limit";
import { toDayString } from "@/lib/dates";

// DELETE /api/admin/blocked-dates/[id] — remove a single blocked date record
//
// `manager`, matching POST. Unblocking is the less dangerous half of the pair —
// it puts a room back on sale rather than taking it off — but a block that can
// be created and erased by the same role leaves no trace of either, which is
// the whole point of the gate.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, "manager");
  if (!auth.ok) return auth.response;

  const { id } = await params;

  // Read before deleting: the audit row's whole value is `oldValue`, and after
  // the delete there is nothing left to describe what was removed.
  const existing = await prisma.blockedDate.findUnique({ where: { id } });
  if (!existing) return fail("Not found", 404);

  try {
    await prisma.blockedDate.delete({ where: { id } });
  } catch {
    return fail("Not found", 404);
  }

  await prisma.auditLog.create({
    data: {
      userId: auth.staff.staffId,
      action: "blocked_date_removed",
      entityType: "blocked_date",
      entityId: existing.roomId ?? "all",
      oldValue: {
        blockDate: toDayString(existing.blockDate),
        reason: existing.reason,
        blockedBy: existing.blockedBy,
      },
      ipAddress: clientIp(req),
    },
  });

  return okEmpty();
}
