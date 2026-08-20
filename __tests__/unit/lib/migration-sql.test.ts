/**
 * B-22 — `\d` in a Postgres regex matches nothing on this database.
 *
 *   'LB-20260727-01' ~ '^LB-\d{8}-\d+$'        →  false
 *   'LB-20260727-01' ~ '^LB-[0-9]{8}-[0-9]+$'  →  true
 *
 * (verified directly against Neon, with standard_conforming_strings on).
 *
 * The damage is that it fails *silently*. `2_booking_counter` used the escape
 * form to backfill booking sequences from numbers already in circulation; a
 * predicate matching nothing means the counter starts at zero and the next
 * booking re-issues a number that already exists, dying on the unique index and
 * reaching the guest as "this room was just booked" — the exact failure the
 * backfill exists to prevent.
 *
 * `2_booking_counter` itself is deliberately left as it is: Prisma checksums
 * applied migrations, so editing one makes `migrate deploy` refuse to run
 * against every database that already has it. `4_daily_counters` re-runs that
 * backfill with bracket classes, which closes it in practice.
 *
 * This test is the part that lasts — it stops the next migration reintroducing
 * it. A unit test cannot reach Postgres, so it guards the text.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "prisma", "migrations");

/** Migration SQL that has already been applied, and so cannot be edited. */
const GRANDFATHERED = new Set(["2_booking_counter"]);

function migrationFiles(): Array<{ name: string; sql: string }> {
  return readdirSync(MIGRATIONS_DIR)
    .filter((d) => statSync(join(MIGRATIONS_DIR, d)).isDirectory())
    .map((name) => ({ name, sql: readFileSync(join(MIGRATIONS_DIR, name, "migration.sql"), "utf8") }));
}

/**
 * Strip `--` comments before scanning. The comments explaining this very rule
 * quote the broken form, and matching those would make the guard unfixable.
 */
function withoutComments(sql: string): string {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

describe("migration SQL", () => {
  it("has migrations to check", () => {
    expect(migrationFiles().length).toBeGreaterThan(0);
  });

  it("never uses \\d, \\s or \\w class shorthands in a regex", () => {
    const offenders: string[] = [];

    for (const { name, sql } of migrationFiles()) {
      if (GRANDFATHERED.has(name)) continue;
      for (const [i, line] of withoutComments(sql).split("\n").entries()) {
        if (/\\[dsw]/.test(line)) {
          offenders.push(`${name}/migration.sql:${i + 1}  ${line.trim()}`);
        }
      }
    }

    expect(
      offenders,
      `Use POSIX bracket classes — [0-9], [[:space:]], [[:alnum:]_] — not \\d/\\s/\\w.\n` +
        `The escape form evaluates false on this database and fails silently.\n` +
        offenders.join("\n")
    ).toEqual([]);
  });

  it("uses the bracket form where 4_daily_counters backfills sequences", () => {
    const sql = migrationFiles().find((m) => m.name === "4_daily_counters")!.sql;

    // The two backfills that would otherwise re-issue an existing number.
    expect(sql).toContain("'^LB-[0-9]{8}-[0-9]+$'");
    expect(sql).toContain("'^BK-[0-9]{8}-[0-9]+$'");
  });

  it("still records why 2_booking_counter is exempt", () => {
    // If this file is ever rewritten from scratch the exemption should go with
    // it — the grandfather list must not outlive its reason.
    expect(GRANDFATHERED.has("2_booking_counter")).toBe(true);
    const sql = migrationFiles().find((m) => m.name === "2_booking_counter")!.sql;
    expect(sql).toMatch(/\\d/);
  });
});
