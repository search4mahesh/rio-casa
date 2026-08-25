/**
 * B-54 — `seed-demo.ts` created instead of upserting, so every run added a
 * fresh set. Four runs left the live database holding four copies of each
 * package and 24 testimonials where six were intended.
 *
 * The package call was written `create({ data: p }).catch(() => {})`,
 * apparently meant to make re-runs safe. There is no unique constraint on
 * `nameEn`, so the insert *succeeded* and duplicated; the `catch` only hid
 * genuine errors.
 *
 * These are static checks, not behavioural ones: a seed script runs `main()`
 * on import and writes to a real database, so it cannot be executed under
 * test. Static is also how the bug was found — the shape of the call is the
 * tell — and a guard against the shape returning is worth more here than a
 * mock that proves the mock works.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const seedDemo = readFileSync("prisma/seed-demo.ts", "utf8");

describe("seed-demo is idempotent (B-54)", () => {
  it("matches packages by name before writing", () => {
    expect(seedDemo).toMatch(/prisma\.package\.findFirst\(\{\s*where:\s*\{\s*nameEn/);
    expect(seedDemo).toMatch(/prisma\.package\.update\(/);
  });

  it("matches testimonials by name before writing", () => {
    expect(seedDemo).toMatch(/prisma\.testimonial\.findFirst\(\{\s*where:\s*\{\s*guestName/);
    expect(seedDemo).toMatch(/prisma\.testimonial\.update\(/);
  });

  it("no longer swallows write errors", () => {
    // `.create(...).catch(() => {})` is the exact line that produced the
    // duplicates while hiding anything that genuinely failed.
    const swallowing = seedDemo
      .split(/\r?\n/)
      .map((l, i) => [i + 1, l] as const)
      .filter(([, l]) => /\.create\(/.test(l) && /\.catch\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/.test(l));
    expect(swallowing.map(([n, l]) => `${n}: ${l.trim()}`)).toEqual([]);
  });

  it("only prunes duplicates when asked", () => {
    // Deleting rows is opt-in: the seeds no longer create duplicates, so the
    // only thing --prune fixes is history.
    expect(seedDemo).toMatch(/const PRUNE = process\.argv\.includes\("--prune"\)/);
    const pruneBlock = seedDemo.slice(seedDemo.indexOf("async function pruneDuplicates"));
    expect(pruneBlock).toMatch(/if \(!PRUNE\)/);
    // Every deleteMany in the file sits behind that flag.
    const deletes = seedDemo.match(/deleteMany\(/g) ?? [];
    expect(deletes.length).toBeGreaterThan(0);
    expect(seedDemo.indexOf("deleteMany(")).toBeGreaterThan(seedDemo.indexOf("if (!PRUNE)"));
  });
});

describe("no seed or repair script swallows write errors", () => {
  it("has no fire-and-forget .catch(() => {}) on a write", () => {
    const hits = execSync('grep -rn "\\.catch" prisma --include=*.ts || true', { encoding: "utf8" })
      .trim().split("\n").filter(Boolean)
      .filter((l) => /\.catch\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/.test(l))
      // A comment describing the anti-pattern is not the anti-pattern. The
      // note explaining why B-54 happened necessarily quotes the old call.
      .filter((l) => !/^[^:]*:\d+:\s*(\/\/|\*|\/\*)/.test(l));
    expect(hits).toEqual([]);
  });
});
