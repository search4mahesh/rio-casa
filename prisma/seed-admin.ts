import { makeScriptClient } from "./script-client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { MIN_PASSWORD_LENGTH, BCRYPT_COST } from "../lib/passwords";

const prisma = makeScriptClient();

// ─────────────────────────────────────────────────────────────
// Staff logins.
//
// The passwords used to be literals in this file — `admin123` on the
// `owner` account — and they were reproduced in README.md and test.md,
// both tracked in git. Nothing in the application could change one, so
// the seeded password was very likely still the live one (B-59).
//
// Now each account gets a random password, printed once, unless an
// explicit one is supplied via the environment. Nothing here is
// guessable from the repository, and `POST /api/admin/auth/password`
// exists for rotating it afterwards.
//
// Upserts, so re-running never rewrites the password of an account that
// already exists — the printed value for a pre-existing row would be a
// lie, so it says "unchanged" instead.
// ─────────────────────────────────────────────────────────────

const ACCOUNTS = [
  { name: "Admin",           email: "admin@riocasa.in",        role: "owner",        envVar: "SEED_OWNER_PASSWORD",        permissions: ["all"] },
  { name: "Priya Sharma",    email: "manager@riocasa.in",      role: "manager",      envVar: "SEED_MANAGER_PASSWORD",      permissions: [] },
  { name: "Ravi Kulkarni",   email: "frontdesk@riocasa.in",    role: "frontdesk",    envVar: "SEED_FRONTDESK_PASSWORD",    permissions: [] },
  { name: "Sunita Patil",    email: "housekeeping@riocasa.in", role: "housekeeping", envVar: "SEED_HOUSEKEEPING_PASSWORD", permissions: [] },
] as const;

/**
 * 18 random bytes as base64url — 24 characters, no ambiguity about
 * whether it clears MIN_PASSWORD_LENGTH.
 */
function generatePassword(): string {
  return randomBytes(18).toString("base64url");
}

function resolvePassword(envVar: string): string {
  const supplied = process.env[envVar];
  if (!supplied) return generatePassword();

  if (supplied.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `${envVar} is shorter than ${MIN_PASSWORD_LENGTH} characters — the API would reject it on the next change.`
    );
  }
  return supplied;
}

async function main() {
  const created: Array<{ role: string; email: string; password: string }> = [];

  for (const account of ACCOUNTS) {
    const existing = await prisma.staff.findUnique({
      where: { email: account.email },
      select: { id: true },
    });

    if (existing) {
      console.log(`•   ${account.role.padEnd(12)} ${account.email}  (exists — password unchanged)`);
      continue;
    }

    const password = resolvePassword(account.envVar);
    const s = await prisma.staff.create({
      data: {
        name: account.name,
        email: account.email,
        role: account.role,
        passwordHash: await bcrypt.hash(password, BCRYPT_COST),
        permissions: [...account.permissions],
        isActive: true,
      },
    });
    created.push({ role: s.role, email: s.email, password });
    console.log(`✅  ${s.role.padEnd(12)} ${s.email}  (created)`);
  }

  if (created.length === 0) {
    console.log("\nNothing created — every account already existed.\n");
    return;
  }

  console.log("\n─── Passwords, shown once ──────────────────────────────");
  for (const c of created) {
    console.log(`  ${c.role.padEnd(12)} ${c.email.padEnd(28)} ${c.password}`);
  }
  console.log("────────────────────────────────────────────────────────");
  console.log("Store these now. They are not recoverable — only replaceable,");
  console.log("via Setup → Hotel & Staff → Change Password.\n");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
