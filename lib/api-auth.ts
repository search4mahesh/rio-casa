import { NextRequest, NextResponse } from "next/server";
import { resolveActiveStaff, ADMIN_COOKIE, type AdminPayload } from "@/lib/admin-auth";
import { hasMinRole, forbidden, type Role } from "@/lib/rbac";
import { fail } from "@/lib/api-response";

// ─────────────────────────────────────────────────────────────
// Route-handler auth gate.
//
// Every admin API handler needs the same two checks — authenticated,
// and holding at least role X. Keeping them here means the 401/403
// contract is defined once instead of being re-typed per handler,
// where it can silently drift.
//
// Server components use `cookies()` from next/headers rather than a
// NextRequest, so they keep calling verifyAdminToken directly.
// ─────────────────────────────────────────────────────────────

export type AuthResult =
  | { ok: true; staff: AdminPayload }
  | { ok: false; response: NextResponse };

/**
 * Resolve the caller and assert a minimum role.
 *
 * ```ts
 * const auth = await requireRole(req, "manager");
 * if (!auth.ok) return auth.response;
 * // auth.staff is AdminPayload from here on
 * ```
 *
 * Returns 401 when there is no valid session, 403 when the session
 * exists but the role is insufficient — never throws, so handlers stay
 * a straight line of early returns.
 */
export async function requireRole(req: NextRequest, min: Role): Promise<AuthResult> {
  // `resolveActiveStaff`, not `verifyAdminToken`: the role and the account's
  // very existence are re-read from the database rather than taken from the
  // 12-hour-old token, so a deactivation or a demotion takes effect on the
  // next request instead of whenever the token happens to expire (B-60).
  const staff = await resolveActiveStaff(req.cookies.get(ADMIN_COOKIE)?.value);

  if (!staff) {
    // `{ success: false }` with no `error` used to go out here, which breaks the
    // one rule lib/api-response.ts exists to hold: `error` is always a string
    // because clients render it directly. A panel doing
    // `setMessage(data.error)` showed the staff member nothing at all when
    // their session expired — the click just appeared to do nothing (B-40).
    // Covers a deactivated account as well as an expired token. They are told
    // apart deliberately loosely: someone whose access was just revoked does
    // not need to be told which of the two it was.
    return { ok: false, response: fail("Your session has expired — please sign in again.", 401) };
  }
  if (!hasMinRole(staff.role, min)) {
    return { ok: false, response: forbidden(min) };
  }

  return { ok: true, staff };
}

/**
 * Authenticated-only gate, no role floor.
 *
 * `housekeeping` is the lowest rank, so this is equivalent to
 * `requireRole(req, "housekeeping")` — it exists to say so at the
 * call site rather than leaving a reader to look the ranking up.
 */
export async function requireAuth(req: NextRequest): Promise<AuthResult> {
  return requireRole(req, "housekeeping");
}
