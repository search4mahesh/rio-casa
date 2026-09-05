/**
 * A deployment with `NEXT_PUBLIC_WHATSAPP_NUMBER` unset used to send guests —
 * with their booking references and enquiries — to `919876543210`, a real
 * number belonging to someone else (B-73).
 *
 * The rule is that a missing number renders no button. These tests pin both
 * halves: the helper returns null, and no call site quietly reintroduces a
 * fallback of its own.
 */
import { describe, it, expect, afterEach } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { whatsappUrl } from "@/lib/whatsapp";

const ORIGINAL = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;
  else process.env.NEXT_PUBLIC_WHATSAPP_NUMBER = ORIGINAL;
});

describe("whatsappUrl", () => {
  it("returns null when no number is configured", () => {
    delete process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;
    expect(whatsappUrl("Hello")).toBeNull();
  });

  it("returns null for an empty number, not a link to wa.me/", () => {
    process.env.NEXT_PUBLIC_WHATSAPP_NUMBER = "";
    expect(whatsappUrl("Hello")).toBeNull();
  });

  it("builds a wa.me link with the message percent-encoded", () => {
    process.env.NEXT_PUBLIC_WHATSAPP_NUMBER = "919999900000";
    expect(whatsappUrl("Hi there & thanks")).toBe(
      "https://wa.me/919999900000?text=Hi%20there%20%26%20thanks"
    );
  });
});

/**
 * Walks with Node's own `fs` rather than shelling out to `grep`. A test that
 * spawns a subprocess from inside a vitest worker fails intermittently under a
 * full parallel run on Windows, reddening a suite that is otherwise green
 * (B-75) — so new scans do not introduce another one.
 */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe("no call site reintroduces a fallback number", () => {
  it("never builds a wa.me URL from an env var with a default", () => {
    const offenders: string[] = [];

    for (const file of [...sourceFiles("app"), ...sourceFiles("components"), ...sourceFiles("lib")]) {
      // `lib/whatsapp.ts` documents the old fallback in prose; the rule is
      // about code, and its own body is the one implementation allowed to read
      // the variable.
      if (file.replace(/\\/g, "/").endsWith("lib/whatsapp.ts")) continue;

      const src = readFileSync(file, "utf8");
      // Comments explain the bug in several places — strip them before judging.
      const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

      // A *numeric* fallback is the bug: it dials someone. A display
      // placeholder is not — `HotelSettings` renders "—" when the number is
      // unset, which is the same "show the problem, not a plausible-looking
      // value" rule the GSTIN field beside it follows (B-62).
      if (/NEXT_PUBLIC_WHATSAPP_NUMBER\s*\?\?\s*["'`]\+?[\d\s-]{6,}["'`]/.test(code)) {
        offenders.push(`${file}: falls back to a hardcoded phone number`);
      }

      // Building the *property's* link by hand instead of through the helper.
      // `/api/admin/communications` interpolates a wa.me URL too, but from the
      // guest's own phone for a staff-sent campaign — a different number for a
      // different purpose, and legitimately not this helper's business.
      if (/wa\.me\/\$\{[^}]*NEXT_PUBLIC_WHATSAPP_NUMBER/.test(code)) {
        offenders.push(`${file}: builds the property wa.me URL outside whatsappUrl()`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
