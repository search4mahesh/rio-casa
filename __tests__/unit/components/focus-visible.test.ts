/**
 * Every public control keeps a visible focus indicator.
 *
 * Twelve form controls across the contact form, both date forms and all four
 * steps of the booking wizard carried `focus:outline-none` paired with nothing
 * but `focus:border-primary` — a 1px border changing colour, which is what a
 * keyboard user got where a focus ring belongs. The admin panels had been
 * doing this correctly with `focus:ring-2` the whole time, which is why the
 * defect survived so long: it looked handled if you grepped for the string
 * rather than for the pairing.
 *
 * A guard, not a snapshot. Collapsing twelve copies into `.input-resort` is a
 * one-off; the thirteenth is a Tuesday, and `focus:outline-none` is the kind of
 * thing that gets copied off an existing line without anyone deciding it.
 *
 * Node's `fs` rather than shelling out to `grep`: a vitest worker spawning a
 * process on Windows fails intermittently under a full parallel run, which is
 * how B-75 reddened an otherwise green suite at random.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** Guest-facing code. The admin panels replace the outline with their own ring. */
const ROOTS = [
  "app/[locale]",
  "components/booking",
  "components/sections",
  "components/layout",
  "components/ui",
];

/**
 * Files that may still remove a focus outline, and why.
 *
 * Every entry is a decision, not an amnesty. Adding one means arguing that the
 * element is not something a keyboard user needs to see focus on — if you
 * cannot, the fix is to delete the class and let the `:focus-visible` rule in
 * `globals.css` do its job.
 */
const ALLOWED: Array<[string, string]> = [
  [
    "app/[locale]/layout.tsx",
    "the <main> the skip link lands on. It is a scroll target given tabIndex=-1 " +
      "so focus actually moves there, not a control — outlining the whole page " +
      "body would be noise, and nothing is 'focused' from the reader's point of view",
  ],
];
const ALLOWED_FILES = new Set(ALLOWED.map(([f]) => f));

function walk(dir: string): string[] {
  let out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out = out.concat(walk(full));
    else if (/\.tsx?$/.test(entry)) out.push(full.replace(/\\/g, "/"));
  }
  return out;
}

/**
 * Prose about focus is not a focus style — the same call `field-labels` and
 * `property-identity` make. A comment explaining *why* the outline must stay
 * has to quote the class to be worth reading.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("public focus indicators", () => {
  const files = ROOTS.flatMap(walk);

  it("finds the guest-facing files to check", () => {
    expect(files.length).toBeGreaterThan(15);
    expect(files.some((f) => f.includes("BookingWizard"))).toBe(true);
    expect(files.some((f) => f.includes("contact"))).toBe(true);
  });

  it("removes no focus outline without a documented reason", () => {
    const offenders: string[] = [];

    for (const f of files) {
      if (ALLOWED_FILES.has(f)) continue;
      const lines = stripComments(readFileSync(f, "utf8")).split(/\r?\n/);
      lines.forEach((line, i) => {
        if (/focus:outline-none|focus-visible:outline-none|outline-none/.test(line)) {
          offenders.push(`${f}:${i + 1}  ${line.trim().slice(0, 80)}`);
        }
      });
    }

    expect(
      offenders,
      "A guest-facing control must keep a visible focus indicator. `globals.css`\n" +
        "gives every focusable element one via `:focus-visible`; removing the\n" +
        "outline leaves a keyboard user with no idea where they are. Use\n" +
        "`.input-resort` for form controls. If an element genuinely must opt out,\n" +
        "add it to ALLOWED above with the reason.\n" +
        offenders.join("\n")
    ).toEqual([]);
  });

  it("still defines the indicator those files are relying on", () => {
    const css = readFileSync("app/globals.css", "utf8");
    // The rule, and both of its tones: the dark outline that shows on a light
    // ground and the light halo that shows on a dark one. Losing either half
    // is how the indicator goes invisible on one surface without anyone
    // noticing on the others.
    const rule = css.slice(css.indexOf(":focus-visible"));
    const body = rule.slice(0, rule.indexOf("}"));
    expect(body).toMatch(/outline:\s*2px solid/);
    expect(body).toMatch(/box-shadow:\s*0 0 0 2px/);
  });

  it("gives .input-resort no outline of its own to remove", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const rule = css.slice(css.indexOf(".input-resort"));
    expect(rule.slice(0, rule.indexOf("}"))).not.toMatch(/outline-none/);
  });
});
