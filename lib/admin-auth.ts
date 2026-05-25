import { SignJWT, jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "dev-secret-change-in-production-32chars"
);

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
    .sign(SECRET);
}

export async function verifyAdminToken(token: string): Promise<AdminPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as AdminPayload;
  } catch {
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
