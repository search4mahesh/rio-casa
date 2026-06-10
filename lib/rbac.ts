import { NextResponse } from "next/server";
import type { Role } from "./rbac-utils";

// ─────────────────────────────────────────────────────────────
// Role-based access control (server side)
//
// Pure utilities (hasMinRole, PAGE_MIN_ROLE, Role type) live in
// lib/rbac-utils.ts so client components can import them safely.
// This file adds `forbidden()` which depends on next/server.
// ─────────────────────────────────────────────────────────────

export type { Role } from "./rbac-utils";
export { RANK, hasMinRole, PAGE_MIN_ROLE } from "./rbac-utils";

/** Standard 403 response for an authenticated user lacking the required role. */
export function forbidden(min?: Role) {
  return NextResponse.json(
    {
      success: false,
      error: min
        ? `Insufficient permissions — requires ${min} access or higher`
        : "Insufficient permissions",
    },
    { status: 403 }
  );
}
