/**
 * B-52 — eleven of the thirteen public pages inherited one title and one
 * description from the root layout, so `/rooms/luxury`, `/packages`,
 * `/contact` and the rest were indistinguishable in a browser tab and competed
 * with each other in search for a single identical snippet.
 *
 * Two things have to hold for the fix, and both are checkable without a
 * browser: every page has copy to render, and none of that copy repeats the
 * brand the root template already appends.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const messages = JSON.parse(readFileSync("messages/en.json", "utf8")) as {
  meta: Record<string, { title: string; description: string }>;
};

/** Every public page, and where its metadata is expected to come from. */
const PAGES: Array<{ route: string; key?: string; file: string }> = [
  { route: "/about", key: "about", file: "app/[locale]/about/page.tsx" },
  { route: "/rooms", key: "rooms", file: "app/[locale]/rooms/page.tsx" },
  { route: "/packages", key: "packages", file: "app/[locale]/packages/page.tsx" },
  { route: "/dining", key: "dining", file: "app/[locale]/dining/page.tsx" },
  { route: "/blog", key: "blog", file: "app/[locale]/blog/page.tsx" },
  { route: "/booking", key: "booking", file: "app/[locale]/booking/page.tsx" },
  { route: "/booking/confirmation", key: "confirmation", file: "app/[locale]/booking/confirmation/page.tsx" },
  { route: "/privacy", key: "privacy", file: "app/[locale]/privacy/page.tsx" },
  // Client components — only a server component can export metadata, so these
  // carry it on a sibling layout instead.
  { route: "/contact", key: "contact", file: "app/[locale]/contact/layout.tsx" },
  { route: "/gallery", key: "gallery", file: "app/[locale]/gallery/layout.tsx" },
  // Dynamic: titled from the record they render.
  { route: "/rooms/[slug]", file: "app/[locale]/rooms/[slug]/page.tsx" },
  { route: "/blog/[slug]", file: "app/[locale]/blog/[slug]/page.tsx" },
];

describe("every public page carries its own metadata (B-52)", () => {
  it.each(PAGES)("$route exports metadata", ({ file }) => {
    expect(existsSync(file), `${file} is missing`).toBe(true);
    const src = readFileSync(file, "utf8");
    expect(/generateMetadata|export const metadata/.test(src), `${file} exports no metadata`).toBe(true);
  });

  it.each(PAGES.filter((p) => p.key))("$route has copy under meta.$key", ({ key }) => {
    const entry = messages.meta[key!];
    expect(entry, `messages.en.json has no meta.${key}`).toBeTruthy();
    expect(entry.title.length).toBeGreaterThan(2);
    expect(entry.description.length).toBeGreaterThan(20);
  });

  it("gives every page a distinct title and description", () => {
    const titles = Object.values(messages.meta).map((m) => m.title);
    const descriptions = Object.values(messages.meta).map((m) => m.description);
    // The whole bug was eleven pages sharing one of each.
    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });
});

describe("titles do not repeat the brand the template appends", () => {
  // app/layout.tsx sets `template: "%s | Rio Casa Mahabaleshwar"`. A page title
  // of "Rooms — Rio Casa" therefore renders "Rooms — Rio Casa | Rio Casa
  // Mahabaleshwar", which is how the blog and privacy pages came to say it
  // twice.
  it("no meta title contains 'Rio Casa'", () => {
    const offenders = Object.entries(messages.meta)
      .filter(([, m]) => /rio casa/i.test(m.title))
      .map(([k, m]) => `${k}: ${m.title}`);
    expect(offenders).toEqual([]);
  });

  it("no page source hardcodes a brand-suffixed title", () => {
    const hits = execSync(
      'grep -rn "title:" app --include=*.tsx || true',
      { encoding: "utf8" }
    )
      .trim().split("\n").filter(Boolean)
      .filter((l) => /title:\s*[`"'].*Rio Casa/i.test(l))
      // The root layout is where the brand legitimately lives.
      .filter((l) => !l.startsWith("app/layout.tsx"));
    expect(hits).toEqual([]);
  });

  it("the root layout still supplies the template and default", () => {
    const root = readFileSync("app/layout.tsx", "utf8");
    expect(root).toMatch(/template:\s*["'`]%s \| Rio Casa Mahabaleshwar/);
    expect(root).toMatch(/default:\s*["'`]Rio Casa/);
  });
});
