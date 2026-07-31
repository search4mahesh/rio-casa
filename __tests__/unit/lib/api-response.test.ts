import { describe, it, expect } from "vitest";
import { z } from "zod";
import { ok, okMessage, okEmpty, fail, failValidation } from "@/lib/api-response";

describe("api-response envelope", () => {
  it("ok() nests the payload under data", async () => {
    const res = ok([{ id: "p1" }]);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, data: [{ id: "p1" }] });
  });

  it("ok() honours a custom status", async () => {
    expect(ok({ id: "x" }, 201).status).toBe(201);
  });

  it("okMessage() keeps message flat, with no data key", async () => {
    const body = await okMessage("Checked in").json();
    expect(body).toEqual({ success: true, message: "Checked in" });
    expect(body).not.toHaveProperty("data");
  });

  it("okEmpty() returns success with no payload", async () => {
    await expect(okEmpty().json()).resolves.toEqual({ success: true });
  });

  it("fail() returns a string error and defaults to 400", async () => {
    const res = fail("Nope");
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ success: false, error: "Nope" });
  });
});

describe("failValidation — regression: Zod errors must not leak as objects", () => {
  const schema = z.object({ amount: z.number().positive("Amount must be positive") });

  it("renders the first issue message as a string", async () => {
    const parsed = schema.safeParse({ amount: -5 });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;

    const body = (await failValidation(parsed.error).json()) as { success: boolean; error: unknown };
    expect(body.success).toBe(false);
    expect(typeof body.error).toBe("string");
    expect(body.error).toBe("Amount must be positive");
  });

  it("never yields '[object Object]' when interpolated by a client toast", async () => {
    const parsed = schema.safeParse({ amount: "nope" });
    if (parsed.success) return;

    const body = (await failValidation(parsed.error).json()) as { error: unknown };
    // Clients do `showToast(data.error ?? "...")` — an object here used to
    // surface as "[object Object]" to front-desk staff.
    expect(String(body.error)).not.toBe("[object Object]");
    expect(typeof body.error).toBe("string");
  });

  it("falls back to a generic message when the error carries no issues", async () => {
    const body = (await failValidation({ issues: [] }).json()) as { error: string };
    expect(body.error).toBe("Invalid input");
  });
});
