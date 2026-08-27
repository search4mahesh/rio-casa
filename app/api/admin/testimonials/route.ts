import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { ok } from "@/lib/api-response";

// GET /api/admin/testimonials?status=pending|approved|all
//
// `Testimonial.isApproved` defaults to false, which implied an approval
// workflow — but there was no panel to approve through and no page that would
// have read an approved one (B-53). This is the missing half; the site reads
// the other through `getTestimonials()`.
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "manager");
  if (!auth.ok) return auth.response;

  const status = req.nextUrl.searchParams.get("status") ?? "all";
  const where =
    status === "pending" ? { isApproved: false }
    : status === "approved" ? { isApproved: true }
    : {};

  const [testimonials, pendingCount] = await Promise.all([
    prisma.testimonial.findMany({ where, orderBy: [{ isApproved: "asc" }, { createdAt: "desc" }] }),
    prisma.testimonial.count({ where: { isApproved: false } }),
  ]);

  return ok({ testimonials, pendingCount });
}
