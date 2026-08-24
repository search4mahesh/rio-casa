/**
 * B-13 / B-32 / B-33 / B-34 — one bug, four times, in four different panels.
 *
 * Every one of them built a `Date` from *local* parts and then serialised it
 * with `toISOString()`, which is the *UTC* day. In IST local midnight is
 * `…T18:30:00Z` on the day before, so the two representations disagree by a
 * full day and the panel silently wrote or displayed the wrong one:
 *
 *   B-13  the walk-in modal opened on yesterday before 05:30 IST
 *   B-32  the shift grid saved Monday's roster to Sunday
 *   B-33  the "Last Month" report always ended a day before the month did
 *   B-34  blocking "today" before 05:30 IST blocked yesterday, invisibly
 *
 * `lib/dates.ts` exists so this cannot happen: a calendar day is always UTC
 * midnight there, and "which day is it?" is answered in the *property's*
 * timezone rather than the viewer's or the server's. The admin panels have no
 * business calling `toISOString()` themselves — `toDayString()` is that call,
 * made on a value guaranteed to be a calendar day.
 *
 * So the rule this guards is simply: **no `toISOString()` under
 * `components/admin/`**. There are no legitimate exceptions there today, which
 * is what makes it worth enforcing as an absolute — a rule with a carve-out is
 * one the next panel argues its way into.
 *
 * (API routes still use `toISOString()` freely and correctly: they serialise
 * values Prisma already handed them as UTC midnight, or real instants like a
 * cron `timestamp`. This test deliberately does not reach them.)
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SCAN_ROOTS = [join(process.cwd(), "components", "admin"), join(process.cwd(), "app", "admin")];

function sourceFiles(dir: string): string[] {
  if (!safeIsDir(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

function safeIsDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Strip comments before scanning. The comments explaining this very rule quote
 * the banned call by name, and matching those would make the guard unfixable —
 * the same reason `migration-sql.test.ts` strips SQL comments first.
 */
function withoutComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "") // block comments, including {/* … */} bodies
    .replace(/(^|[^:])\/\/.*$/gm, "$1"); // line comments, sparing the // in URLs
}

describe("admin panels build calendar days through lib/dates", () => {
  const files = SCAN_ROOTS.flatMap(sourceFiles);

  it("finds admin sources to scan", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("never calls toISOString() — use toDayString()/propertyDayString() instead", () => {
    const offenders = files
      .map((file) => ({ file, code: withoutComments(readFileSync(file, "utf8")) }))
      .filter(({ code }) => code.includes("toISOString("))
      .map(({ file }) => file.replace(process.cwd(), "").replace(/\\/g, "/"));

    expect(
      offenders,
      `These files derive a date string with toISOString(). A Date built from local ` +
        `parts is the previous day in UTC (see B-13/B-32/B-33/B-34). Use lib/dates.ts: ` +
        `propertyDayString() for "today at the property", dateOnly() to parse a ` +
        `YYYY-MM-DD input, toDayString() to render a calendar day back out.`
    ).toEqual([]);
  });
});
