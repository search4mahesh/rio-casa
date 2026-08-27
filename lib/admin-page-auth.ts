import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { resolveActiveStaff, ADMIN_COOKIE, type AdminPayload } from "@/lib/admin-auth";

// ─────────────────────────────────────────────────────────────
// Session gate for admin **server components**.
//
// Route handlers get a NextRequest and use `requireRole` from
// lib/api-auth.ts. Pages and layouts do not — they read `cookies()`
// from next/headers and redirect rather than returning a response, so
// they need their own entry point to the same check.
//
// Six of them hand-rolled it as the same three lines, and every one of
// those lines trusted the token's own claims. That is the half of B-60
// the API gate cannot cover: a deactivated staff member could still
// load every admin page, and only found out when the panels inside
// started returning 401s.
// ─────────────────────────────────────────────────────────────

/**
 * The signed-in staff member, re-read from the database, or a redirect
 * to the login page.
 *
 * ```ts
 * const staff = await requireStaffPage();   // AdminPayload from here
 * ```
 *
 * Never returns null: a missing, expired, or revoked session redirects
 * instead, so callers get a value rather than a check to forget.
 */
export async function requireStaffPage(): Promise<AdminPayload> {
  const token = cookies().get(ADMIN_COOKIE)?.value;
  const staff = await resolveActiveStaff(token);
  if (!staff) redirect("/admin/login");
  return staff;
}
