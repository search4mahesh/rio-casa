import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

/**
 * Every route answers through `lib/api-response.ts`.
 *
 * CLAUDE.md has said so for a long time, and 54 handlers hand-wrote the
 * envelope anyway. That is how the payload key drifted to `promos` / `plan` /
 * `booking` / `kpi`, forcing every client to know a different key per
 * endpoint, and how a 401 went out with no `error` string at all — which made
 * "Email Invoice" do nothing visible when a session expired (B-40).
 *
 * A guard, not a style preference: the rule is only worth having if it cannot
 * quietly stop being true, and it stopped being true 54 times.
 */

const ROUTES = execSync('grep -rl "" app/api --include=route.ts', { encoding: "utf8" })
  .trim().split("\n").filter(Boolean);

/**
 * Prose about the envelope is not an envelope — the same reason
 * `field-labels.test.tsx` and `migration-sql.test.ts` strip comments first. A
 * comment explaining why the helpers exist legitimately quotes the shape they
 * replaced.
 */
function withoutComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("API routes answer through lib/api-response.ts", () => {
  it("finds the routes to check", () => {
    expect(ROUTES.length).toBeGreaterThan(40);
  });

  it("no handler hand-writes a { success } envelope", () => {
    const offenders: string[] = [];

    for (const file of ROUTES) {
      const code = withoutComments(readFileSync(file, "utf8"));
      // The literal the helpers exist to replace, in either the inline or the
      // wrapped form.
      if (/NextResponse\.json\(\s*\{[\s\S]{0,80}?success:/.test(code)) {
        offenders.push(file.replace(/\\/g, "/"));
      }
    }

    expect(
      offenders,
      "These routes build the response envelope by hand. Use ok() / okMessage() /\n" +
        "okEmpty() / fail() / failValidation() from lib/api-response.ts — clients read\n" +
        "`data.data` and `data.error` and cannot follow a key that varies per route.\n" +
        offenders.join("\n")
    ).toEqual([]);
  });

  // `failValidation` flattens to the first issue message. `parsed.error` on its
  // own serialises to an object, and every panel does
  // `showToast(data.error)` — which renders "[object Object]" to staff.
  it("no handler passes a Zod error object where a string belongs", () => {
    const offenders: string[] = [];

    for (const file of ROUTES) {
      const code = withoutComments(readFileSync(file, "utf8"));
      if (/fail\(\s*\w*parsed\.error/.test(code) || /error:\s*\w*parsed\.error\b(?!\.)/.test(code)) {
        offenders.push(file.replace(/\\/g, "/"));
      }
      if (/\.flatten\(\)/.test(code)) {
        offenders.push(`${file.replace(/\\/g, "/")} (uses .flatten())`);
      }
    }

    expect(
      offenders,
      "Use failValidation(parsed.error) — it takes the first issue message.\n" +
        offenders.join("\n")
    ).toEqual([]);
  });
});
