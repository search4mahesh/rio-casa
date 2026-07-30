import { describe, it, expect } from "vitest";
import {
  NAV,
  LEGACY_ROUTES,
  findHub,
  resolveTab,
  visibleTabs,
  type NavItem,
} from "@/lib/admin-nav";
import { RANK, type Role } from "@/lib/rbac-utils";

const MONEY = NAV.find((n) => n.href === "/admin/money") as NavItem;
const SETUP = NAV.find((n) => n.href === "/admin/setup") as NavItem;
const CALENDAR = NAV.find((n) => n.href === "/admin/calendar") as NavItem;

describe("NAV structure", () => {
  it("exposes exactly seven top-level items", () => {
    expect(NAV).toHaveLength(7);
  });

  it("uses only valid roles", () => {
    for (const item of NAV) {
      expect(RANK[item.minRole]).toBeDefined();
      for (const tab of item.tabs ?? []) {
        expect(RANK[tab.minRole]).toBeDefined();
      }
    }
  });

  it("never gates a hub above the least-privileged tab it contains", () => {
    // Otherwise the hub would be unreachable for staff who can see a tab in it.
    for (const item of NAV) {
      if (!item.tabs?.length) continue;
      const lowestTab = Math.min(...item.tabs.map((t) => RANK[t.minRole]));
      expect(RANK[item.minRole]).toBeLessThanOrEqual(lowestTab);
    }
  });

  it("has unique hrefs and unique tab slugs within each hub", () => {
    expect(new Set(NAV.map((n) => n.href)).size).toBe(NAV.length);
    for (const item of NAV) {
      const slugs = (item.tabs ?? []).map((t) => t.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
    }
  });
});

describe("findHub", () => {
  it("finds hub pages", () => {
    expect(findHub("/admin/money")?.label).toBe("Money");
    expect(findHub("/admin/setup")?.label).toBe("Setup");
  });

  it("returns undefined for non-hub pages", () => {
    expect(findHub("/admin/bookings")).toBeUndefined();
    expect(findHub("/admin/dashboard")).toBeUndefined();
  });
});

describe("visibleTabs — Money hub", () => {
  it("shows front desk only the Invoices tab", () => {
    expect(visibleTabs(MONEY, "frontdesk").map((t) => t.slug)).toEqual(["invoices"]);
  });

  it("shows managers every money tab", () => {
    expect(visibleTabs(MONEY, "manager").map((t) => t.slug)).toEqual([
      "invoices", "expenses", "reconcile", "reports", "nightaudit",
    ]);
  });

  it("shows housekeeping nothing", () => {
    expect(visibleTabs(MONEY, "housekeeping")).toEqual([]);
  });
});

describe("visibleTabs — Setup hub", () => {
  it("hides the owner-only Hotel & Staff tab from managers", () => {
    const slugs = visibleTabs(SETUP, "manager").map((t) => t.slug);
    expect(slugs).not.toContain("hotel");
    expect(slugs).toContain("rates");
  });

  it("shows owners the Hotel & Staff tab", () => {
    expect(visibleTabs(SETUP, "owner").map((t) => t.slug)).toContain("hotel");
  });
});

describe("resolveTab", () => {
  it("returns the requested tab when the role allows it", () => {
    expect(resolveTab(MONEY, "reports", "manager")?.slug).toBe("reports");
  });

  it("falls back to the first permitted tab when the request is not allowed", () => {
    // Front desk asking for the manager-only expenses tab lands on invoices.
    expect(resolveTab(MONEY, "expenses", "frontdesk")?.slug).toBe("invoices");
  });

  it("falls back for an unknown slug", () => {
    expect(resolveTab(MONEY, "nonsense", "manager")?.slug).toBe("invoices");
  });

  it("defaults to the first tab when none is requested", () => {
    expect(resolveTab(CALENDAR, undefined, "frontdesk")?.slug).toBe("month");
  });

  it("returns undefined when the role may see no tab at all", () => {
    expect(resolveTab(SETUP, "rates", "frontdesk")).toBeUndefined();
    expect(resolveTab(MONEY, "invoices", "housekeeping")).toBeUndefined();
  });
});

describe("LEGACY_ROUTES", () => {
  it("points every old route at a real hub and an existing tab", () => {
    for (const [from, to] of Object.entries(LEGACY_ROUTES)) {
      expect(from.startsWith("/admin/")).toBe(true);

      const [path, query] = to.split("?");
      const hub = NAV.find((n) => n.href === path);
      expect(hub, `${from} -> ${to} has no matching nav item`).toBeDefined();

      if (query) {
        const slug = new URLSearchParams(query).get("tab");
        expect(
          hub!.tabs?.some((t) => t.slug === slug),
          `${to} references unknown tab "${slug}"`
        ).toBe(true);
      }
    }
  });

  it("does not redirect a route onto itself", () => {
    for (const [from, to] of Object.entries(LEGACY_ROUTES)) {
      expect(to.split("?")[0]).not.toBe(from);
    }
  });
});

describe("role ranking assumptions", () => {
  it("orders roles from housekeeping up to owner", () => {
    const order: Role[] = ["housekeeping", "frontdesk", "manager", "owner"];
    for (let i = 1; i < order.length; i++) {
      expect(RANK[order[i]]).toBeGreaterThan(RANK[order[i - 1]]);
    }
  });
});
