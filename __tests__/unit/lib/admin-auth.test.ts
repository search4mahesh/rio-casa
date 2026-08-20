import { describe, it, expect, afterEach, vi } from "vitest";
import { signAdminToken, verifyAdminToken } from "@/lib/admin-auth";
import type { AdminPayload } from "@/lib/admin-auth";

const payload: AdminPayload = {
  staffId: "staff_001",
  name: "Ravi Kumar",
  email: "ravi@riocasa.in",
  role: "manager",
};

describe("signAdminToken / verifyAdminToken", () => {
  it("round-trips: signed token can be verified and returns the original payload", async () => {
    const token = await signAdminToken(payload);
    const result = await verifyAdminToken(token);
    expect(result).toMatchObject(payload);
  });

  it("returns null for a completely invalid token", async () => {
    const result = await verifyAdminToken("not.a.valid.jwt");
    expect(result).toBeNull();
  });

  it("returns null for an empty string", async () => {
    expect(await verifyAdminToken("")).toBeNull();
  });

  it("returns null when the token is signed with a different secret", async () => {
    // Manually craft a token with the wrong secret
    const { SignJWT } = await import("jose");
    const wrongSecret = new TextEncoder().encode("wrong-secret-totally-different");
    const badToken = await new SignJWT({ ...payload })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(wrongSecret);
    expect(await verifyAdminToken(badToken)).toBeNull();
  });

  it("token contains expected fields", async () => {
    const token = await signAdminToken(payload);
    const result = await verifyAdminToken(token);
    expect(result?.staffId).toBe("staff_001");
    expect(result?.role).toBe("manager");
    expect(result?.email).toBe("ravi@riocasa.in");
  });
});

/**
 * The fallback secret is committed to this repository, so a production
 * deployment that reaches it is one where anyone reading the source can mint an
 * `owner` token. Same failure mode `denyIfNotCron` was rewritten to close: a
 * missing secret must fail shut.
 */
describe("missing JWT_SECRET", () => {
  const realSecret = process.env.JWT_SECRET;
  const realEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.JWT_SECRET = realSecret;
    vi.stubEnv("NODE_ENV", realEnv as string);
  });

  it("refuses to sign a token in production", async () => {
    delete process.env.JWT_SECRET;
    vi.stubEnv("NODE_ENV", "production");

    await expect(signAdminToken(payload)).rejects.toThrow(/JWT_SECRET is not set/);
  });

  it("refuses to verify a token minted with the development fallback", async () => {
    // What an attacker would present: a token signed with the public string.
    const { SignJWT } = await import("jose");
    const forged = await new SignJWT({ ...payload, role: "owner" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("12h")
      .sign(new TextEncoder().encode("dev-secret-change-in-production-32chars"));

    delete process.env.JWT_SECRET;
    vi.stubEnv("NODE_ENV", "production");

    expect(await verifyAdminToken(forged)).toBeNull();
  });

  it("still uses the fallback outside production so a fresh clone runs", async () => {
    delete process.env.JWT_SECRET;
    vi.stubEnv("NODE_ENV", "development");

    const token = await signAdminToken(payload);
    expect(await verifyAdminToken(token)).toMatchObject(payload);
  });
});
