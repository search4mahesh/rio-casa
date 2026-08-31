/**
 * The property's identity is stated once, in `lib/property.ts`.
 *
 * It used to be stated wherever it was needed: the root layout, the title
 * template in two more files, the schema.org graph, the footer, the navbar,
 * the hero, the map section, the WhatsApp prefill, the confirmation email, the
 * invoice mail and the printed invoice. Roughly thirty literals for a dozen
 * facts, none of them aware of the others — so "Rio Casa", "Rio Casa Resort"
 * and "Rio Casa Mahabaleshwar" all coexisted, the invoice email printed a
 * GSTIN belonging to no configuration at all, and B-52 shipped because the
 * brand was written in two places that could not see each other.
 *
 * A guard, not a snapshot. Consolidating thirty literals is a one-off; letting
 * the thirty-first back in is a Tuesday. Same reasoning as
 * `field-labels.test.tsx`, and the same technique — prose about the property
 * is documentation, not a hardcoded fact, so comments are stripped first.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { PROPERTY, BRAND, SITE_TITLE, TITLE_TEMPLATE, ADMIN_BRAND, telHref } from "@/lib/property";

/**
 * Files that may still name the property, and why.
 *
 * Every entry is a decision, not an amnesty. Adding one means arguing that the
 * file is copy rather than configuration — if you cannot, the fix is to read
 * `PROPERTY`.
 */
const ALLOWED: Array<[string, string]> = [
  ["lib/property.ts", "the one place the facts are stated"],
  ["lib/site-url.ts", "the canonical origin's designated home, for the same reason"],
  [
    "app/global-error.tsx",
    "replaces the root layout when the root layout throws, so it deliberately " +
      "depends on nothing — which is why its copy is inline English (B-67)",
  ],
  // Editorial copy: prose *about* this property, which a second property would
  // not reword but replace outright. That it lives in JSX rather than in
  // messages/en.json is a separate, pre-existing debt.
  ["app/[locale]/about/page.tsx", "the property's story, written as prose"],
  ["lib/blog-posts.ts", "seed input for the blog; no page reads it"],
  ["lib/room-marketing.ts", "per-room marketing copy"],
  ["components/admin/panels/Communications.tsx", "staff-editable message templates"],
];

const ALLOWED_FILES = new Set(ALLOWED.map(([f]) => f));

/**
 * The facts a file must not restate, read from `PROPERTY` itself so renaming
 * the property re-aims the guard rather than silently disarming it.
 *
 * The phone is matched in its display form only: `98765 43210` on its own is
 * also the placeholder in the *guest's* phone field, which is not a fact about
 * the property.
 */
const TERMS: string[] = [
  PROPERTY.name,
  PROPERTY.city,
  // `region` is deliberately absent. A state name is an address component and
  // also a cuisine and a culture — "the culinary heritage of Maharashtra" on
  // /dining is about the food, not about where the post arrives. Flagging it
  // would push people into rewording copy to appease this test. `city`,
  // `district` and `postalCode` already anchor the address shape.
  PROPERTY.district,
  PROPERTY.postalCode,
  PROPERTY.phone,
  PROPERTY.email,
  PROPERTY.bookingsEmail,
  PROPERTY.upiId,
  PROPERTY.billingName,
];

/**
 * Prose about the property is not a hardcoded property fact.
 *
 * A comment explaining *why* the brand may not appear in a page title has to
 * quote the brand to be worth reading, and flagging that pushes people into
 * rewording documentation to appease a regex — the same call
 * `field-labels.test.tsx` makes about the word "label".
 */
function stripComments(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

/** Matches a term as a whole word, so "Maharashtrian" is not "Maharashtra". */
function mentions(haystack: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const lead = /^\w/.test(term) ? "\\b" : "";
  const tail = /\w$/.test(term) ? "\\b" : "";
  return new RegExp(lead + escaped + tail, "i").test(haystack);
}

const SOURCES = execSync('find app components lib -name "*.ts" -o -name "*.tsx"', { encoding: "utf8" })
  .trim()
  .split("\n")
  .map((f) => f.trim().split("\\").join("/"))
  .filter(Boolean);

describe("the property is named in one place", () => {
  it("finds the source tree to check", () => {
    // A `find` that matches nothing passes every assertion below it.
    expect(SOURCES.length).toBeGreaterThan(100);
    expect(SOURCES).toContain("lib/property.ts");
  });

  it("has no source file restating a property fact", () => {
    const offenders: string[] = [];

    for (const file of SOURCES) {
      if (ALLOWED_FILES.has(file)) continue;
      const bare = stripComments(readFileSync(file, "utf8"));
      const found = TERMS.filter((t) => mentions(bare, t));
      if (found.length > 0) offenders.push(`${file}  →  ${found.join(", ")}`);
    }

    expect(
      offenders,
      "These files state a fact that belongs to lib/property.ts. Import\n" +
        "`PROPERTY` and read it — or, if the text is genuinely copy rather than\n" +
        "configuration, move it to messages/en.json and pass the name in as an\n" +
        "ICU parameter.\n" +
        offenders.join("\n")
    ).toEqual([]);
  });

  it("keeps every allowlisted file present and justified", () => {
    for (const [file, reason] of ALLOWED) {
      expect(SOURCES, `${file} is allowlisted but no longer exists`).toContain(file);
      expect(reason.length, `${file} needs a reason`).toBeGreaterThan(20);
    }
  });
});

describe("copy names the property through a parameter", () => {
  const raw = readFileSync("messages/en.json", "utf8");

  it("has no property fact written into a string", () => {
    const offenders = TERMS.filter((t) => mentions(raw, t));
    expect(
      offenders,
      "messages/en.json states a property fact literally. Copy that needs to\n" +
        'name the property takes it as an ICU parameter — "{property}" or\n' +
        '"{city}" — supplied by whatever reads the string.\n' +
        offenders.join(", ")
    ).toEqual([]);
  });

  /**
   * Every `meta` string is read by `pageMetadata`, which supplies exactly
   * `property` and `city`. A description reaching for anything else renders
   * the placeholder to the visitor — next-intl does not fall back.
   */
  it("uses only the parameters pageMetadata supplies", () => {
    const messages = JSON.parse(raw) as {
      meta: Record<string, { title: string; description: string }>;
    };
    const supplied = new Set(["property", "city"]);
    const offenders: string[] = [];

    for (const [key, entry] of Object.entries(messages.meta)) {
      for (const field of ["title", "description"] as const) {
        for (const m of entry[field].matchAll(/\{(\w+)\}/g)) {
          if (!supplied.has(m[1])) offenders.push(`meta.${key}.${field}: {${m[1]}}`);
        }
      }
    }

    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});

/**
 * Parameterised copy is only single-sourced if the values actually arrive.
 *
 * next-intl does not fall back: a string that says `{property}` and is read
 * without one renders `Moments captured at {property}` to the visitor and logs
 * `IntlError: FORMATTING_ERROR` — which is exactly what /gallery did, because
 * the subtitle is read by `components/sections/GalleryGrid.tsx` and not by the
 * page named after it. Grepping for the reader is how that was missed; this
 * resolves the namespace instead.
 */
describe("every parameterised string is read with its parameters", () => {
  const messages = JSON.parse(readFileSync("messages/en.json", "utf8")) as Record<string, unknown>;

  /** `messages.footer.copyright` from the path "footer", "copyright". */
  function lookup(ns: string, key: string): unknown {
    return [ns, ...key.split(".")].reduce<unknown>(
      (node, part) => (node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined),
      messages
    );
  }

  it("passes values wherever the string needs them", () => {
    const offenders: string[] = [];

    for (const file of SOURCES) {
      const src = stripComments(readFileSync(file, "utf8"));

      // `const t = useTranslations("footer")` — the variable *and* which
      // namespace it reads, so `t("subtitle")` in seven files can be told
      // apart.
      const bindings = [
        ...src.matchAll(/(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*["']([^"']+)["']\s*\)/g),
      ];

      for (const [, variable, ns] of bindings) {
        const calls = new RegExp(`\\b${variable}\\(\\s*["']([^"']+)["']\\s*(,?)`, "g");
        for (const m of src.matchAll(calls)) {
          const [, key, comma] = m;
          const value = lookup(ns, key);
          if (typeof value !== "string") continue;

          const placeholders = [...value.matchAll(/\{(\w+)\}/g)].map((p) => p[1]);
          if (placeholders.length > 0 && comma !== ",") {
            offenders.push(`${file}: ${variable}("${key}") → ${ns}.${key} needs {${placeholders.join("}, {")}}`);
          }
        }
      }
    }

    expect(
      offenders,
      "These call sites read a string with an ICU placeholder and pass no\n" +
        "values. next-intl does not fall back — the visitor sees the raw\n" +
        "placeholder and the console logs IntlError: FORMATTING_ERROR.\n" +
        offenders.join("\n")
    ).toEqual([]);
  });
});

describe("the derived names", () => {
  it("builds each from the property rather than restating it", () => {
    expect(BRAND).toBe(`${PROPERTY.name} ${PROPERTY.city}`);
    expect(SITE_TITLE).toBe(`${PROPERTY.name} — ${PROPERTY.descriptor}`);
    expect(TITLE_TEMPLATE).toBe(`%s | ${BRAND}`);
    expect(ADMIN_BRAND).toBe(`${PROPERTY.name} Admin`);
  });

  it("gives a dialable tel: URI", () => {
    // The stored form carries display spacing, and a tel: URI with spaces in
    // it is not guaranteed to dial.
    expect(telHref()).toBe(`tel:${PROPERTY.phone.replace(/[^\d+]/g, "")}`);
    expect(telHref()).not.toMatch(/\s/);
  });
});
