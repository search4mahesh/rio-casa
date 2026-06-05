import { NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────
// Role-based access control
//
// Roles form a hierarchy — a higher rank inherits every permission
// of the ranks below it (an owner can do anything a manager can, etc.):
//
//   housekeeping (1)  →  frontdesk (2)  →  manager (3)  →  owner (4)
//
// Each protected route declares the MINIMUM role required.
// ─────────────────────────────────────────────────────────────

export type Role = "owner" | "manager" | "frontdesk" | "housekeeping";

const RANK: Record<Role, number> = {
  housekeeping: 1,
  frontdesk: 2,
  manager: 3,
  owner: 4,
};

/** True when `role` meets or exceeds the required `min` role. */
export function hasMinRole(role: string | undefined | null, min: Role): boolean {
  const have = RANK[(role ?? "") as Role] ?? 0;
  return have >= RANK[min];
}

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
