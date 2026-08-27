import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { adminHubMetadata, adminMetadata, adminSectionMetadata, ADMIN_TITLE_TEMPLATE } from "@/lib/admin-metadata";
import { NAV } from "@/lib/admin-nav";

/**
 * Every admin page inherited the root layout's default, so all of them read
 * "Rio Casa — Luxury Resort in Mahabaleshwar" in the browser tab. With several
 * open — the way the panel is actually used — none could be told apart. This
 * is B-52's complaint on the admin side.
 */

const title = (m: { title?: unknown }) => m.title as string;

describe("adminHubMetadata", () => {
  // `/admin/money?tab=reports` and `?tab=invoices` are the same page. A title
  // of "Money" for both would fix nothing, which is why the tab leads.
  it("leads with the tab, because that is what differs", () => {
    expect(title(adminHubMetadata("/admin/money", "reports"))).toBe("Reports · Money");
    expect(title(adminHubMetadata("/admin/money", "invoices"))).toBe("Invoices · Money");
  });

  it("gives every tab of a hub a distinct title", () => {
    for (const hub of NAV.filter((n) => n.tabs?.length)) {
      const titles = hub.tabs!.map((t) => title(adminHubMetadata(hub.href, t.slug)));
      expect(new Set(titles).size, `${hub.href} has duplicate tab titles`).toBe(titles.length);
    }
  });

  it("gives every hub a distinct title across the whole panel", () => {
    const all = NAV.flatMap((hub) =>
      hub.tabs?.length
        ? hub.tabs.map((t) => title(adminHubMetadata(hub.href, t.slug)))
        : [hub.label]
    );
    expect(new Set(all).size).toBe(all.length);
  });

  it("falls back to the first tab when none is named", () => {
    expect(title(adminHubMetadata("/admin/money", undefined))).toBe("Invoices · Money");
    expect(title(adminHubMetadata("/admin/money", "nonsense"))).toBe("Invoices · Money");
  });

  it("does not throw on a path that is not a hub", () => {
    expect(title(adminHubMetadata("/admin/nope", "x"))).toBe("Admin");
  });
});

describe("adminSectionMetadata", () => {
  /**
   * A plain string title on a layout consumes the template inherited from
   * `app/admin/layout.tsx`, leaving nested routes bare: `/admin/bookings/[id]`
   * rendered "Booking" while `/admin/guests/[id]` kept the suffix.
   */
  it("re-declares the template so nested routes keep the suffix", () => {
    const m = adminSectionMetadata("Bookings") as { title: { default: string; template: string } };
    expect(m.title.default).toBe("Bookings");
    expect(m.title.template).toBe(ADMIN_TITLE_TEMPLATE);
  });

  it("adminMetadata stays a plain title, for a leaf route", () => {
    expect(adminMetadata("Today")).toEqual({ title: "Today" });
  });
});

describe("the admin panel titles itself", () => {
  const adminPages = execSync('grep -rl "" app/admin --include=page.tsx', { encoding: "utf8" })
    .trim().split("\n").filter(Boolean)
    .map((f) => f.replace(/\\/g, "/"));

  it("finds the admin pages", () => {
    expect(adminPages.length).toBeGreaterThan(10);
  });

  /**
   * A page needs a title of its own unless it is a legacy redirect (those
   * never render) or a sibling layout supplies one — which is what a client
   * component has to do, since only a server component can export metadata.
   */
  it("every page that renders has a title from itself or a sibling layout", () => {
    const missing: string[] = [];

    for (const page of adminPages) {
      const src = readFileSync(page, "utf8");
      if (/redirect\(/.test(src) && src.split("\n").length < 20) continue; // legacy redirect

      const own = /generateMetadata|export const metadata/.test(src);
      const layout = page.replace(/page\.tsx$/, "layout.tsx");
      const viaLayout = existsSync(layout) &&
        /generateMetadata|export const metadata/.test(readFileSync(layout, "utf8"));

      if (!own && !viaLayout) missing.push(page);
    }

    expect(
      missing,
      "These admin pages would inherit the root layout's title and be\n" +
        "indistinguishable in a row of browser tabs:\n" + missing.join("\n")
    ).toEqual([]);
  });

  it("the admin layout overrides the marketing template and blocks indexing", () => {
    const src = readFileSync("app/admin/layout.tsx", "utf8");
    expect(src).toContain("ADMIN_TITLE_TEMPLATE");
    // robots.txt disallows /admin, but that governs fetching, not indexing.
    expect(src).toMatch(/robots:\s*\{\s*index:\s*false/);
  });

  it("the template is defined once, not restated per file", () => {
    const restated = execSync('grep -rn "Rio Casa Admin" app lib --include=*.ts --include=*.tsx || true',
      { encoding: "utf8" })
      .trim().split("\n").filter(Boolean)
      .filter((l) => /template:\s*["'`]%s/.test(l));

    expect(restated, `The suffix belongs in ADMIN_TITLE_TEMPLATE:\n${restated.join("\n")}`).toEqual([]);
  });
});
