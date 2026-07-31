import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { ok } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  return ok(auth.staff);
}
