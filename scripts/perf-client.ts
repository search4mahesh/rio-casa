import "dotenv/config";
import { chromium, type Browser } from "playwright";

/**
 * What the browser pays: bytes shipped, and what it does with them.
 *
 *   npm run build && npm start            # in one terminal
 *   npx tsx scripts/perf-client.ts        # in another
 *   npx tsx scripts/perf-client.ts --cpu 4        # emulate a slower device
 *   npx tsx scripts/perf-client.ts --only booking
 *
 * Read-only: navigations only, no forms submitted and no buttons pressed.
 *
 * `scripts/perf-http.ts` stops at the response. This one carries on into the
 * part the guest actually experiences — parse, hydrate, paint — because a page
 * with a fast TTFB and 300KB of JavaScript is not a fast page on the phone a
 * guest is booking from.
 *
 * The measurements, and why each is here:
 *
 *   LCP        when the biggest thing on screen finished painting. The number
 *              Google ranks on, and the one a guest reads as "it loaded".
 *   CLS        how much the layout jumped afterwards. A shifting page during
 *              checkout is how a guest presses the wrong button.
 *   long tasks total main-thread time in tasks over 50ms. This is hydration
 *              cost: while it runs the page is painted but does not respond.
 *   JS KB      transferred, not parsed — what actually crossed the wire.
 *
 * Every page is loaded in a **fresh browser context with no cache**, which is
 * the first visit from a search result or a WhatsApp link. That is the visit
 * that decides whether the property gets the direct booking instead of the
 * OTA, so it is the one worth measuring.
 *
 * Each target is loaded **twice, and only the second is reported**. The first
 * is thrown away because it warms two server-side caches that belong to the
 * server rather than to the visitor, and would otherwise be charged to
 * whoever happened to be measured first:
 *
 *  - `next/image` optimises on demand and caches per (image, width) under
 *    `.next/cache/images`. The first request for a size runs a resize: with
 *    that cache cleared, LCP on `/` measured 1108ms against 192ms warm.
 *  - The Prisma pool closes idle connections after 30s, and the next
 *    database-backed page then pays a ~1.9s TLS handshake.
 *
 * Both are real costs and both are reported by the other harnesses — the
 * handshake as `cold` in `scripts/perf-http.ts`. They are excluded here so
 * that this table answers one question only: once the server is warm, what
 * does the *browser* do with what it was sent?
 *
 * `--cpu N` divides main-thread speed by N through CDP. The desktop this runs
 * on is far faster than the phone the booking arrives from; 4 is a reasonable
 * mid-range Android.
 */

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1] ?? fallback;
};

const PORT = process.env.PORT ?? "3000";
const BASE = arg("base", `http://localhost:${PORT}`);
const CPU = Math.max(1, Number(arg("cpu", "1")));
const ONLY = arg("only", "").toLowerCase();

type Target = { label: string; path: string; auth?: boolean };

type Metrics = {
  ttfb: number;
  fcp: number;
  lcp: number;
  cls: number;
  longTaskMs: number;
  longTaskCount: number;
  domContentLoaded: number;
  load: number;
};

// Installed before any page script runs, so the observers are in place for the
// entries that fire earliest. `buffered: true` still matters — LCP and FCP can
// both land before this finishes executing.
const OBSERVER = `
  window.__perf = { cls: 0, longTaskMs: 0, longTaskCount: 0, lcp: 0 };
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__perf.lcp = e.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
  } catch {}
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (!e.hadRecentInput) window.__perf.cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
  } catch {}
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        window.__perf.longTaskMs += e.duration;
        window.__perf.longTaskCount += 1;
      }
    }).observe({ type: "longtask", buffered: true });
  } catch {}
`;

async function measure(browser: Browser, target: Target, cookie: string | null) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, // a phone, which is how a guest arrives
    deviceScaleFactor: 2,
  });
  if (cookie && target.auth) {
    const [name, value] = cookie.split("=");
    await context.addCookies([{ name, value, domain: "localhost", path: "/" }]);
  }
  await context.addInitScript(OBSERVER);

  const page = await context.newPage();

  // Bytes by resource type, counted from the network rather than from the
  // build manifest: what a route *ships* is the union of its own chunks and
  // everything shared, and only the browser knows which of those it fetched.
  const bytes = new Map<string, number>();
  const jsUrls = new Set<string>();
  page.on("response", async (res) => {
    try {
      const type = res.request().resourceType();
      const len = Number(res.headers()["content-length"] ?? 0);
      const size = len || (await res.body().catch(() => Buffer.alloc(0))).byteLength;
      bytes.set(type, (bytes.get(type) ?? 0) + size);
      if (type === "script") jsUrls.add(res.url());
    } catch {
      /* a response that never completed contributes nothing */
    }
  });

  const consoleErrors: string[] = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  page.on("pageerror", (e) => consoleErrors.push(String(e)));

  if (CPU > 1) {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
  }

  await page.goto(BASE + target.path, { waitUntil: "load", timeout: 60_000 });
  // LCP is only final once the page settles; give late images and the
  // hydration pass a moment to land before reading it.
  await page.waitForTimeout(2500);

  const metrics = await page.evaluate<Metrics>(`(() => {
    const nav = performance.getEntriesByType("navigation")[0] || {};
    const fcp = performance.getEntriesByName("first-contentful-paint")[0];
    const p = window.__perf || {};
    return {
      ttfb: nav.responseStart || 0,
      fcp: fcp ? fcp.startTime : 0,
      lcp: p.lcp || 0,
      cls: p.cls || 0,
      longTaskMs: p.longTaskMs || 0,
      longTaskCount: p.longTaskCount || 0,
      domContentLoaded: nav.domContentLoadedEventEnd || 0,
      load: nav.loadEventEnd || 0,
    };
  })()`);

  await context.close();

  const total = [...bytes.values()].reduce((a, b) => a + b, 0);
  return {
    ...target,
    ...metrics,
    js: bytes.get("script") ?? 0,
    css: bytes.get("stylesheet") ?? 0,
    img: bytes.get("image") ?? 0,
    font: bytes.get("font") ?? 0,
    doc: bytes.get("document") ?? 0,
    total,
    jsFiles: jsUrls.size,
    consoleErrors,
  };
}

async function main() {
  try {
    await fetch(BASE, { redirect: "manual" });
  } catch {
    console.error(`No server on ${BASE}. Start one with \`npm run build && npm start\`.`);
    process.exitCode = 1;
    return;
  }

  const { makeScriptClient } = await import("../prisma/script-client");
  const db = makeScriptClient();
  const owner = await db.staff.findFirst({
    where: { role: "owner", isActive: true },
    select: { id: true, name: true, email: true, role: true },
  });
  const room = await db.room.findFirst({
    where: { isActive: true },
    select: { roomType: true },
    orderBy: { roomNumber: "asc" },
  });
  await db.$disconnect();

  const { signAdminToken, ADMIN_COOKIE } = await import("../lib/admin-auth");
  const cookie = owner
    ? `${ADMIN_COOKIE}=${await signAdminToken({
        staffId: owner.id,
        name: owner.name,
        email: owner.email,
        role: owner.role,
      })}`
    : null;

  const { today, addDays, toDayString } = await import("../lib/dates");
  const checkIn = toDayString(addDays(today(), 21));
  const checkOut = toDayString(addDays(today(), 23));

  const targets: Target[] = [
    { label: "/", path: "/" },
    { label: "/rooms", path: "/rooms" },
    { label: "/rooms + dates", path: `/rooms?checkIn=${checkIn}&checkOut=${checkOut}` },
    ...(room ? [{ label: "/rooms/[slug]", path: `/rooms/${room.roomType}` }] : []),
    { label: "/booking (wizard)", path: "/booking" },
    { label: "/gallery", path: "/gallery" },
    { label: "/blog", path: "/blog" },
    { label: "/contact", path: "/contact" },
    { label: "/admin/calendar", path: "/admin/calendar", auth: true },
    { label: "/admin/bookings", path: "/admin/bookings", auth: true },
  ];

  const selected = ONLY ? targets.filter((t) => t.label.toLowerCase().includes(ONLY)) : targets;

  console.log(`base       ${BASE}`);
  console.log(`device     390x844 @2x, no cache, CPU throttle ${CPU}x\n`);

  const rows: Awaited<ReturnType<typeof measure>>[] = [];
  const browser = await chromium.launch();
  try {
    for (const t of selected) {
      // Discarded: it warms the image optimiser and the connection pool. See
      // the note at the top — those are the server's costs, not the browser's.
      await measure(browser, t, cookie);
      rows.push(await measure(browser, t, cookie));
      process.stdout.write(".");
    }
  } finally {
    await browser.close();
  }
  console.log("\n");

  const pad = (s: string, n: number) => s.padEnd(n);
  const col = (s: string | number, w: number) => String(s).padStart(w);
  const kb = (n: number) => (n / 1024).toFixed(0);

  console.log(
    pad("page", 20) +
      col("LCP", 8) +
      col("FCP", 8) +
      col("CLS", 7) +
      col("block", 8) +
      col("JS KB", 8) +
      col("img KB", 8) +
      col("all KB", 8)
  );
  console.log("─".repeat(75));
  for (const r of [...rows].sort((a, b) => b.lcp - a.lcp)) {
    console.log(
      pad(r.label.slice(0, 19), 20) +
        col(r.lcp.toFixed(0), 8) +
        col(r.fcp.toFixed(0), 8) +
        col(r.cls.toFixed(3), 7) +
        col(r.longTaskMs.toFixed(0), 8) +
        col(kb(r.js), 8) +
        col(kb(r.img), 8) +
        col(kb(r.total), 8)
    );
  }

  console.log("\nLCP/FCP/block in ms. `block` is total time in main-thread tasks over 50ms —");
  console.log("the window where the page is painted but does not answer a tap.\n");

  const heaviestImages = [...rows].sort((a, b) => b.img - a.img).slice(0, 3);
  console.log("most image bytes:");
  for (const r of heaviestImages) {
    const share = r.total ? ((r.img / r.total) * 100).toFixed(0) : "0";
    console.log(`  ${col(kb(r.img), 6)} KB  ${pad(r.label, 20)} ${share}% of the page`);
  }

  const withErrors = rows.filter((r) => r.consoleErrors.length);
  if (withErrors.length) {
    console.log("\nconsole errors:");
    for (const r of withErrors) {
      console.log(`\n  ${r.label}`);
      for (const e of r.consoleErrors.slice(0, 4)) console.log(`    ${e.slice(0, 140)}`);
    }
  } else {
    console.log("\nconsole clean on every page");
  }
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exitCode = 1;
});
