import { describe, it, expect } from "vitest";
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
