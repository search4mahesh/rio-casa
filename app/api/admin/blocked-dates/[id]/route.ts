import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAdminToken, ADMIN_COOKIE } from "@/lib/admin-auth";
import { hasMinRole, forbidden } from "@/lib/rbac";

// DELETE /api/admin/blocked-dates/[id] — remove a single blocked date record
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  const staff = token ? await verifyAdminToken(token) : null;
  if (!staff) return NextResponse.json({ success: false }, { status: 401 });
  if (!hasMinRole(staff.role, "frontdesk")) return forbidden("frontdesk");

  const { id } = await params;

  try {
    await prisma.blockedDate.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
}
