import { SignJWT, jwtVerify } from "jose";

/**
 * Fallback used only outside production, so `npm run dev` works from a fresh
 * clone with no `.env`. It is committed to this repository, which is exactly
 * why production must never reach it: anyone who can read the source could
 * mint themselves an `owner` token.
 */
const DEV_ONLY_SECRET = "dev-secret-change-in-production-32chars";

/**
 * Resolved per call rather than at module load.
 *
 * Throwing at import time would take `next build` down whenever the build
 * environment lacks the variable, which is a different problem from a
 * misconfigured *deployment*. Resolving lazily means a production server with
 * no `JWT_SECRET` fails every sign and every verify — logins 500, sessions
 * 401 — instead of quietly accepting tokens signed with a public string.
 *
 * This is the same failure mode `denyIfNotCron` was rewritten to close: a
 * missing secret has to fail shut, not open. See lib/cron-auth.ts.
 */
function secret(): Uint8Array {
  const configured = process.env.JWT_SECRET;
  if (configured) return new TextEncoder().encode(configured);

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "JWT_SECRET is not set — refusing to sign or verify admin tokens with the public development fallback"
    );
  }
  return new TextEncoder().encode(DEV_ONLY_SECRET);
}

export interface AdminPayload {
  staffId: string;
  name: string;
  email: string;
  role: string;
}

export async function signAdminToken(payload: AdminPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(secret());
}

export async function verifyAdminToken(token: string): Promise<AdminPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as AdminPayload;
  } catch (err) {
    // A missing secret in production lands here as well, which is the intended
    // outcome — no session verifies — but it is a deployment fault rather than
    // a bad token, so say so instead of failing silently.
    if (err instanceof Error && err.message.startsWith("JWT_SECRET is not set")) {
      console.error("[admin-auth]", err.message);
    }
    return null;
  }
}

export const ADMIN_COOKIE = "admin_token";

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: 60 * 60 * 12,
  path: "/",
};

/**
 * Resolve a session token to the account **as it stands right now**.
 *
 * `verifyAdminToken` above proves only that we signed the token and that it
 * has not expired. Everything inside it — `role`, and the fact the account was
 * active — is a snapshot taken at login, and the token lives for 12 hours.
 *
 * That gap was reachable: pressing *Deactivate* in Setup → Hotel & Staff
 * greyed the row out and showed a success toast while the person kept working
 * normally until their token expired, and an `owner` demoted to `frontdesk`
 * kept owner powers for long enough to promote themselves back (B-60). The
 * panel reported a revocation that had not happened.
 *
 * So the row is re-read on every request and the **database** value wins:
 * `isActive` false is no session at all, and `role` comes from the column
 * rather than the claim. One indexed lookup on a primary key, against handlers
 * that already run several queries — and the admin panel is a front desk, not
 * a public endpoint.
 *
 * Deliberately not cached. A cache here is the same bug with a shorter fuse.
 */
export async function resolveActiveStaff(token: string | undefined): Promise<AdminPayload | null> {
  if (!token) return null;

  const claims = await verifyAdminToken(token);
  if (!claims) return null;

  // Imported lazily so the JWT half of this module stays free of a database
  // dependency — `signAdminToken`/`verifyAdminToken` are pure, and the tests
  // that mock them should not have to stand up a Prisma client.
  const { prisma } = await import("@/lib/prisma");

  const staff = await prisma.staff.findUnique({
    where: { id: claims.staffId },
    select: { id: true, name: true, email: true, role: true, isActive: true },
  });

  if (!staff || !staff.isActive) return null;

  return {
    staffId: staff.id,
    name: staff.name,
    email: staff.email,
    role: staff.role,
  };
}
