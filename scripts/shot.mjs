#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// Screenshot any page of the running app, logging into the admin
// panel first when the path needs it.
//
//   node scripts/shot.mjs /admin/calendar
//   node scripts/shot.mjs /admin/calendar?tab=month --width 1536
//   node scripts/shot.mjs / --no-auth            # public site
//   node scripts/shot.mjs /admin/money --role manager
//   node scripts/shot.mjs /admin/calendar --full # full-page capture
//
// Assumes the dev server is already up on PORT (default 3000).
// Writes to .screenshots/ and prints the path plus any console errors.
// ─────────────────────────────────────────────────────────────

import { chromium } from "playwright";
import { mkdirSync } from "fs";
import path from "path";
// Same reason prisma.config.ts and prisma/script-client.ts do it: this is a
// standalone script, so Next never loads the env file for it. `dotenv/config`
// reads `.env` — without this the SHOT_* passwords below are always undefined.
import "dotenv/config";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const has = (name) => args.includes(`--${name}`);

// Git Bash (MSYS) rewrites arguments that look like absolute paths: "/"
// becomes "C:/Program Files/Git/" and "/rooms" becomes ".../Git/rooms".
// Undo that so `--path /` means the site root, not the Git install dir.
function sitePath(p) {
  const mangled = /^[A-Za-z]:[\\/].*?[\\/]Git[\\/]?(.*)$/.exec(p);
  if (mangled) return "/" + (mangled[1] ?? "");
  return p.startsWith("/") ? p : "/" + p;
}

const positional = args.find((a) => a.startsWith("/"));
const target = sitePath(flag("path", positional ?? "/admin/calendar"));
const port = process.env.PORT ?? "3000";
const base = `http://localhost:${port}`;
const width = Number(flag("width", 1536));
const height = Number(flag("height", 900));
const role = flag("role", "owner");
const outDir = ".screenshots";

// Passwords come from the environment, never from this file. They used to be
// literals here and in two SKILL.md files, which is part of how the seeded
// owner password ended up published in git (B-59). `npm run seed:admin` prints
// a random one per account; put them in `.env` as SHOT_* to use this.
const ACCOUNTS = {
  owner:        { email: "admin@riocasa.in",        envVar: "SHOT_OWNER_PASSWORD" },
  manager:      { email: "manager@riocasa.in",      envVar: "SHOT_MANAGER_PASSWORD" },
  frontdesk:    { email: "frontdesk@riocasa.in",    envVar: "SHOT_FRONTDESK_PASSWORD" },
  housekeeping: { email: "housekeeping@riocasa.in", envVar: "SHOT_HOUSEKEEPING_PASSWORD" },
};

const needsAuth = target.startsWith("/admin") && !has("no-auth");

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width, height } });
const page = await context.newPage();

const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push(String(e)));

try {
  if (needsAuth) {
    const account = ACCOUNTS[role];
    if (!account) throw new Error(`Unknown role "${role}". Use one of: ${Object.keys(ACCOUNTS).join(", ")}`);

    const password = process.env[account.envVar];
    if (!password) {
      throw new Error(
        `${account.envVar} is not set. Screenshotting an admin page needs the ${role} password —
` +
        `set it in .env, or re-run \`npm run seed:admin\` on a fresh database to print one.`
      );
    }
    const creds = { email: account.email, password };

    // Hit the API directly rather than driving the login form — fewer moving
    // parts, and the session cookie lands in the same browser context.
    const res = await context.request.post(`${base}/api/admin/auth/login`, { data: creds });
    if (!res.ok()) {
      throw new Error(
        `Login failed (${res.status()}). Have you seeded staff? \`npm run seed:admin\`\n${await res.text()}`
      );
    }
  }

  await page.goto(base + target, { waitUntil: "networkidle", timeout: 60_000 });

  // Next compiles routes on demand, and panels fetch after mount — wait for
  // the loading text to clear rather than sleeping a fixed amount.
  await page
    .locator("text=/Loading/i")
    .first()
    .waitFor({ state: "hidden", timeout: 30_000 })
    .catch(() => {});

  const name = (target.replace(/[^\w]+/g, "_").replace(/^_|_$/g, "") || "root") + ".png";
  const file = path.join(outDir, name);
  await page.screenshot({ path: file, fullPage: has("full") });

  console.log(`url        ${base}${target}`);
  console.log(`viewport   ${width}x${height}`);
  console.log(`screenshot ${file}`);
  if (consoleErrors.length) {
    console.log(`\n⚠️  ${consoleErrors.length} console error(s):`);
    for (const e of consoleErrors.slice(0, 10)) console.log("   " + e);
  } else {
    console.log("console    clean");
  }
} catch (err) {
  console.error("FAILED:", err.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
