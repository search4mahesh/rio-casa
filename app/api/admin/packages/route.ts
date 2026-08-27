import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { ok } from "@/lib/api-response";

// GET /api/admin/packages
//
// Every package, active or retired — the panel's job is to manage them, not to
// advertise them, so it sees what the public reader hides. The public side
// goes through `getPackages()` in lib/site-content.ts and filters on
// `isActive` plus the validity window.
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "manager");
  if (!auth.ok) return auth.response;

  const packages = await prisma.package.findMany({ orderBy: { price: "asc" } });
  return ok(packages);
}
