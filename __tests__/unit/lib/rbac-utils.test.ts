import { describe, it, expect } from "vitest";
import { hasMinRole, PAGE_MIN_ROLE, RANK } from "@/lib/rbac-utils";

describe("PAGE_MIN_ROLE", () => {
  it("every entry maps to a valid Role", () => {
    const valid = Object.keys(RANK);
    for (const [path, role] of Object.entries(PAGE_MIN_ROLE)) {
      expect(valid, `${path} has unknown role "${role}"`).toContain(role);
    }
  });

  it("/admin/settings requires owner", () => {
    expect(PAGE_MIN_ROLE["/admin/settings"]).toBe("owner");
  });

  it("/admin/reports requires manager", () => {
    expect(PAGE_MIN_ROLE["/admin/reports"]).toBe("manager");
  });

  it("/admin/invoices requires frontdesk", () => {
    expect(PAGE_MIN_ROLE["/admin/invoices"]).toBe("frontdesk");
  });

  it("/admin/housekeeping is accessible to housekeeping role", () => {
    const min = PAGE_MIN_ROLE["/admin/housekeeping"];
    expect(min).toBe("housekeeping");
    expect(hasMinRole("housekeeping", min)).toBe(true);
  });

  it("/admin/dashboard is accessible to all roles", () => {
    const min = PAGE_MIN_ROLE["/admin/dashboard"];
    expect(hasMinRole("housekeeping", min)).toBe(true);
    expect(hasMinRole("frontdesk",    min)).toBe(true);
    expect(hasMinRole("manager",      min)).toBe(true);
    expect(hasMinRole("owner",        min)).toBe(true);
  });

  it("/admin/settings is inaccessible to manager and below", () => {
    const min = PAGE_MIN_ROLE["/admin/settings"];
    expect(hasMinRole("manager",      min)).toBe(false);
    expect(hasMinRole("frontdesk",    min)).toBe(false);
    expect(hasMinRole("housekeeping", min)).toBe(false);
    expect(hasMinRole("owner",        min)).toBe(true);
  });
});
