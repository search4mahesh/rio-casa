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
