import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { ok } from "@/lib/api-response";
import { positiveIntParam } from "@/lib/query-params";

// GET /api/admin/inquiries
//
// The read side of `/api/contact`. The table had exactly one call site — the
// `create` in that route — so an inquiry only ever reached staff if the
// best-effort Resend notification landed, and vanished silently if it did not
// (B-61).
//
// `frontdesk`, not `manager`: an inquiry is a prospective guest asking whether
// a room is free, which is desk work. Gating it at manager would keep leads
// away from the people who answer the phone.
//
// `?status=open` (default) | `handled` | `all`.
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "frontdesk");
  if (!auth.ok) return auth.response;

  const { searchParams } = req.nextUrl;

  // `positiveIntParam`, never `parseInt` — NaN propagates into `skip` and
  // kills the request with an empty 500 (B-41).
  const page = positiveIntParam(searchParams.get("page"));
  const pageSize = 20;

  const status = searchParams.get("status") ?? "open";
  const where =
    status === "handled" ? { handledAt: { not: null } }
    : status === "all" ? {}
    : { handledAt: null };

  const [total, openCount, inquiries] = await Promise.all([
    prisma.contactInquiry.count({ where }),
    // Always reported, whichever view is being shown, so the tab that says
    // "Open" can carry the number without a second request.
    prisma.contactInquiry.count({ where: { handledAt: null } }),
    prisma.contactInquiry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return ok({ inquiries, total, openCount, page, pageSize });
}
