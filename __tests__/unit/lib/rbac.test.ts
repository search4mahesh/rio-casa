import { describe, it, expect } from "vitest";
import { hasMinRole, forbidden } from "@/lib/rbac";

describe("hasMinRole — role hierarchy", () => {
  it("owner satisfies every minimum", () => {
    expect(hasMinRole("owner", "owner")).toBe(true);
    expect(hasMinRole("owner", "manager")).toBe(true);
    expect(hasMinRole("owner", "frontdesk")).toBe(true);
    expect(hasMinRole("owner", "housekeeping")).toBe(true);
  });

  it("manager satisfies manager and below, not owner", () => {
    expect(hasMinRole("manager", "owner")).toBe(false);
    expect(hasMinRole("manager", "manager")).toBe(true);
    expect(hasMinRole("manager", "frontdesk")).toBe(true);
    expect(hasMinRole("manager", "housekeeping")).toBe(true);
  });

  it("frontdesk satisfies frontdesk and housekeeping, not manager/owner", () => {
    expect(hasMinRole("frontdesk", "owner")).toBe(false);
    expect(hasMinRole("frontdesk", "manager")).toBe(false);
    expect(hasMinRole("frontdesk", "frontdesk")).toBe(true);
    expect(hasMinRole("frontdesk", "housekeeping")).toBe(true);
  });

  it("housekeeping satisfies only housekeeping", () => {
    expect(hasMinRole("housekeeping", "owner")).toBe(false);
    expect(hasMinRole("housekeeping", "manager")).toBe(false);
    expect(hasMinRole("housekeeping", "frontdesk")).toBe(false);
    expect(hasMinRole("housekeeping", "housekeeping")).toBe(true);
  });

  it("unknown / missing role satisfies nothing", () => {
    expect(hasMinRole("intern", "housekeeping")).toBe(false);
    expect(hasMinRole(undefined, "housekeeping")).toBe(false);
    expect(hasMinRole(null, "housekeeping")).toBe(false);
    expect(hasMinRole("", "housekeeping")).toBe(false);
  });
});

describe("forbidden", () => {
  it("returns a 403 response", async () => {
    const res = forbidden("manager");
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/manager/);
  });

  it("works without a role argument", async () => {
    const res = forbidden();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/Insufficient/i);
  });
});
