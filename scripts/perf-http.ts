import "dotenv/config";

/**
 * End-to-end page and endpoint latency against a running server.
 *
 *   npm run build && npm start          # in one terminal
 *   npx tsx scripts/perf-http.ts        # in another
 *   npx tsx scripts/perf-http.ts --runs 7 --filter admin
 *
 * Read-only: every request is a GET.
 *
 * Pass `--filter` a bare word, not a path: Git Bash rewrites an argument that
 * looks like an absolute path, so `--filter /rooms` arrives as
 * `C:/Program Files/Git/rooms` and matches nothing. `scripts/shot.mjs` undoes
 * that for its one path argument; here the fix is to write `--filter rooms`.
 *
 * **Point it at a production build, never `next dev`.** Dev compiles each
 * route on first request and skips the production optimiser, so the first
 * number is a compile and the rest are of a different build than the one that
 * ships. `next start` is the thing worth measuring.
 *
 * The companion to `prisma/perf-queries.ts`. That one counts what a request
 * asks the database for; this one measures what the visitor waits for, which
 * is that plus rendering, serialisation and the RSC payload. Two columns
 * matter and they answer different questions:
 *
 *   ttfb   the server had nothing to send yet — data fetching and rendering
 *   total  the whole response was on the wire — adds payload size
 *
 * The first request to a route is reported separately as `cold`. It carries
 * the module load and the first database connection (a TLS handshake to Neon,
 * seconds from a laptop), and on Vercel every scaled-up instance pays it
 * again — so it is a real number, not a warm-up to be discarded.
 *
 * Admin sessions are minted here with `signAdminToken` rather than by posting
 * the login form: this script needs no password, so there is nothing for it to
 * read out of the environment and nothing to leak (B-59).
 */

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1] ?? fallback;
};

const PORT = process.env.PORT ?? "3000";
const BASE = arg("base", `http://localhost:${PORT}`);
const RUNS = Math.max(1, Number(arg("runs", "5")));
const FILTER = arg("filter", "").toLowerCase();

type Target = { path: string; group: string; auth?: boolean };
type Sample = { ttfb: number; total: number; status: number; bytes: number };

async function hit(path: string, cookie: string | null): Promise<Sample> {
  const started = performance.now();
  const res = await fetch(BASE + path, {
    headers: cookie ? { cookie } : {},
    redirect: "follow",
  });
  const ttfb = performance.now() - started;
  const body = await res.arrayBuffer();
  return { ttfb, total: performance.now() - started, status: res.status, bytes: body.byteLength };
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1];

async function main() {
  // Fail early and clearly rather than reporting a page of connection errors.
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
    select: { id: true, slug: true, roomType: true },
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
  if (!cookie) console.log("no active owner account — admin targets will measure the login redirect\n");

  const { today, addDays, toDayString } = await import("../lib/dates");
  const checkIn = toDayString(addDays(today(), 14));
  const checkOut = toDayString(addDays(today(), 16));

  const targets: Target[] = [
    { path: "/", group: "public page" },
    { path: "/rooms", group: "public page" },
    { path: `/rooms?checkIn=${checkIn}&checkOut=${checkOut}`, group: "public page" },
    ...(room ? [{ path: `/rooms/${room.roomType}`, group: "public page" }] : []),
    { path: "/booking", group: "public page" },
    { path: "/gallery", group: "public page" },
    { path: "/blog", group: "public page" },
    { path: "/about", group: "public page" },
    { path: "/dining", group: "public page" },
    { path: "/contact", group: "public page" },

    ...(room
      ? [
          {
            path: `/api/booking/availability?roomId=${room.id}&checkIn=${checkIn}&checkOut=${checkOut}`,
            group: "public api",
          },
          {
            path: `/api/booking/quote?roomId=${room.id}&checkIn=${checkIn}&checkOut=${checkOut}&guests=2`,
            group: "public api",
          },
        ]
      : []),

    { path: "/admin", group: "admin page", auth: true },
    { path: "/admin/calendar", group: "admin page", auth: true },
    { path: "/admin/bookings", group: "admin page", auth: true },
    { path: "/admin/guests", group: "admin page", auth: true },
    { path: "/admin/money", group: "admin page", auth: true },
    { path: "/admin/night-audit", group: "admin page", auth: true },
    { path: "/admin/housekeeping", group: "admin page", auth: true },
    { path: "/admin/setup", group: "admin page", auth: true },

    { path: "/api/admin/calendar", group: "admin api", auth: true },
    { path: "/api/admin/night-audit/summary", group: "admin api", auth: true },
    { path: "/api/admin/reports", group: "admin api", auth: true },
    { path: "/api/admin/bookings", group: "admin api", auth: true },
    { path: "/api/admin/rooms/status", group: "admin api", auth: true },
    { path: "/api/admin/occupancy", group: "admin api", auth: true },
  ];

  const selected = FILTER
    ? targets.filter((t) => t.path.toLowerCase().includes(FILTER) || t.group.includes(FILTER))
    : targets;

  console.log(`base       ${BASE}`);
  console.log(`runs       1 cold + ${RUNS} warm per target, issued sequentially\n`);

  type Row = Target & { cold: Sample; warmTtfb: number; warmTotal: number; bytes: number; status: number };
  const rows: Row[] = [];

  for (const t of selected) {
    const c = t.auth ? cookie : null;
    const cold = await hit(t.path, c);
    const warm: Sample[] = [];
    for (let i = 0; i < RUNS; i++) warm.push(await hit(t.path, c));
    rows.push({
      ...t,
      cold,
      warmTtfb: median(warm.map((s) => s.ttfb)),
      warmTotal: median(warm.map((s) => s.total)),
      bytes: warm[warm.length - 1].bytes,
      status: warm[warm.length - 1].status,
    });
    process.stdout.write(".");
  }
  console.log("\n");

  const pad = (s: string, n: number) => s.padEnd(n);
  const col = (s: string | number, w: number) => String(s).padStart(w);

  console.log(
    pad("target", 44) + col("code", 5) + col("cold", 8) + col("ttfb", 8) + col("total", 8) + col("KB", 8)
  );
  console.log("─".repeat(81));

  let group = "";
  for (const r of [...rows].sort((a, b) => b.warmTtfb - a.warmTtfb)) {
    if (r.group !== group) {
      group = r.group;
      console.log(`\n${group}`);
    }
    console.log(
      pad("  " + r.path.slice(0, 40), 44) +
        col(r.status, 5) +
        col(r.cold.total.toFixed(0), 8) +
        col(r.warmTtfb.toFixed(0), 8) +
        col(r.warmTotal.toFixed(0), 8) +
        col((r.bytes / 1024).toFixed(0), 8)
    );
  }

  const bad = rows.filter((r) => r.status >= 400);
  if (bad.length) {
    console.log(`\n${bad.length} target(s) did not return 2xx/3xx:`);
    for (const r of bad) console.log(`  ${r.status}  ${r.path}`);
  }

  const heavy = [...rows].sort((a, b) => b.bytes - a.bytes).slice(0, 3);
  console.log("\nlargest responses:");
  for (const r of heavy) console.log(`  ${(r.bytes / 1024).toFixed(0).padStart(5)} KB  ${r.path}`);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exitCode = 1;
});
