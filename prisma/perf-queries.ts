import "dotenv/config";
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Database round-trip profiler for the pages and the read-only endpoints.
 *
 *   npx tsx prisma/perf-queries.ts
 *   npx tsx prisma/perf-queries.ts --repeat 3       # median of N runs
 *   npx tsx prisma/perf-queries.ts --filter admin   # only matching scenarios
 *
 * Read-only. Every scenario is a GET handler or a catalogue read, so this is
 * safe to point at the live database.
 *
 * Why round trips and not wall-clock alone: `DATABASE_URL` is a Neon endpoint
 * in us-east-1, so one statement costs ~250ms from a laptop in India and ~2ms
 * from a Vercel function in the same region. A time measured here says very
 * little about production. **The number of statements a request issues is the
 * part that travels** — it is identical in both places, and it is what a code
 * change can quietly make worse. So `trips` is the headline column and the
 * times are there to show which of them hurt.
 *
 * The app singleton is instrumented rather than a private client, because the
 * scenarios call the real page-data functions and the real route handlers and
 * those import `@/lib/prisma`. Assigning `globalThis.prisma` before they load
 * is the same hook `lib/prisma.ts` already uses for hot reload, so no app code
 * has to know this script exists.
 */

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set — check .env");

type Trip = { sql: string; ms: number };
let trips: Trip[] | null = null;

const client = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
  log: [{ emit: "event", level: "query" }],
} as never) as PrismaClient & {
  $on: (event: "query", cb: (e: { query: string; duration: number }) => void) => void;
};

client.$on("query", (e) => trips?.push({ sql: e.query, ms: e.duration }));

// Assigned before any app module is imported: `lib/prisma.ts` reads this and
// only builds a client of its own when it finds nothing here.
(globalThis as unknown as { prisma: PrismaClient }).prisma = client;

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1] ?? fallback;
};
const REPEAT = Math.max(1, Number(arg("repeat", "1")));
const FILTER = arg("filter", "").toLowerCase();

type Scenario = { name: string; group: string; run: () => Promise<unknown> };
type Measured = {
  name: string;
  group: string;
  wallMs: number;
  trips: number;
  dbMs: number;
  dupes: string[];
  slowest: Trip[];
  error?: string;
};

async function measure(s: Scenario): Promise<Measured> {
  trips = [];
  const started = performance.now();
  let error: string | undefined;
  try {
    await s.run();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const wallMs = performance.now() - started;
  const recorded = trips ?? [];
  trips = null;

  // One statement issued more than once in a request is the N+1 shape. Worth
  // naming on its own: at 250ms a trip it is the difference between a page
  // that loads and one that does not.
  const counts = new Map<string, number>();
  for (const t of recorded) counts.set(t.sql, (counts.get(t.sql) ?? 0) + 1);
  const dupes = [...counts.entries()]
    .filter(([, n]) => n > 1)
    .sort((a, b) => b[1] - a[1])
    .map(([sql, n]) => `${n}x ${sql.replace(/\s+/g, " ").slice(0, 92)}`);

  return {
    name: s.name,
    group: s.group,
    wallMs,
    trips: recorded.length,
    dbMs: recorded.reduce((sum, t) => sum + t.ms, 0),
    dupes,
    // Many cheap trips and one expensive statement are different problems with
    // different fixes, and the totals above cannot tell them apart. Anything
    // far above the RTT floor is real work in Postgres, not the wire.
    slowest: [...recorded].sort((a, b) => b.ms - a.ms).slice(0, 3),
    error,
  };
}

async function main() {
  // Pay the TLS handshake and the first connection before anything is timed —
  // it is seconds, and it belongs to no scenario.
  const connectStart = performance.now();
  await client.$queryRaw`SELECT 1`;
  const connectMs = performance.now() - connectStart;

  const rtts: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t = performance.now();
    await client.$queryRaw`SELECT 1`;
    rtts.push(performance.now() - t);
  }
  rtts.sort((a, b) => a - b);
  const rtt = rtts[2];

  console.log(`database   ${new URL(connectionString!).host}`);
  console.log(`connect    ${connectMs.toFixed(0)}ms  (TLS + first statement)`);
  console.log(`rtt        ${rtt.toFixed(0)}ms  median SELECT 1 — the floor on one round trip\n`);

  // Fixtures, read outside the measurement.
  const room = await client.room.findFirstOrThrow({
    where: { isActive: true },
    select: { id: true, slug: true, roomType: true },
    orderBy: { roomNumber: "asc" },
  });
  const post = await client.blogPost.findFirst({
    where: { isPublished: true },
    select: { slug: true },
  });
  const owner = await client.staff.findFirst({
    where: { role: "owner", isActive: true },
    select: { id: true, name: true, email: true, role: true },
  });

  const { signAdminToken, ADMIN_COOKIE } = await import("../lib/admin-auth");
  const token = owner
    ? await signAdminToken({
        staffId: owner.id,
        name: owner.name,
        email: owner.email,
        role: owner.role,
      })
    : null;
  if (!token) console.log("no active owner account — admin scenarios will report 401\n");

  const { NextRequest } = await import("next/server");
  const adminRequest = (path: string) =>
    new NextRequest(`http://localhost:3000${path}`, {
      headers: token ? { cookie: `${ADMIN_COOKIE}=${token}` } : {},
    });

  const { getRoomCategories, getRoomCategory } = await import("../lib/room-catalogue");
  const { getTestimonials, getBlogPosts, getBlogPost, getGalleryImages } = await import(
    "../lib/site-content"
  );
  const { getAvailableRooms, nextAvailableByType, catalogueAvailability } =
    await import("../lib/booking-service");
  const { today, addDays } = await import("../lib/dates");

  const checkIn = addDays(today(), 14);
  const checkOut = addDays(checkIn, 2);
  const day = (d: Date) => d.toISOString().slice(0, 10);

  const scenarios: Scenario[] = [
    {
      name: "/ (home)",
      group: "public page",
      run: async () => {
        // The same two loads the page awaits, in the same order — sequentially,
        // which is exactly the property being measured.
        await getTestimonials(6);
        await getRoomCategories();
      },
    },
    { name: "/rooms (no dates)", group: "public page", run: () => getRoomCategories() },
    {
      name: "/rooms?checkIn&checkOut", // mirrors app/[locale]/rooms/page.tsx
      group: "public page",
      run: async () => {
        await getRoomCategories();
        await catalogueAvailability(checkIn, checkOut, 60);
      },
    },
    {
      name: "getAvailableRooms (one stay)",
      group: "public api",
      run: () => getAvailableRooms(checkIn, checkOut, 1),
    },
    { name: "/rooms/[slug]", group: "public page", run: () => getRoomCategory(room.roomType) },
    { name: "/gallery", group: "public page", run: () => getGalleryImages() },
    { name: "/blog", group: "public page", run: () => getBlogPosts() },
    ...(post
      ? [{ name: "/blog/[slug]", group: "public page", run: () => getBlogPost(post.slug) }]
      : []),
    {
      name: "nextAvailableByType (60d)",
      group: "public page",
      run: () => nextAvailableByType(2, checkIn, 60),
    },
  ];

  const publicRoutes: Array<[string, string]> = [
    [
      "/api/booking/availability",
      `?roomId=${room.id}&checkIn=${day(checkIn)}&checkOut=${day(checkOut)}`,
    ],
    [
      "/api/booking/quote",
      `?roomId=${room.id}&checkIn=${day(checkIn)}&checkOut=${day(checkOut)}&guests=2`,
    ],
  ];

  const adminRoutes = [
    "/api/admin/calendar",
    "/api/admin/reports",
    "/api/admin/occupancy",
    "/api/admin/bookings",
    "/api/admin/rooms/status",
    "/api/admin/guests",
    "/api/admin/invoices",
    "/api/admin/audit",
    "/api/admin/night-audit/summary",
    "/api/admin/housekeeping",
    "/api/admin/laundry",
    "/api/admin/inquiries",
    "/api/admin/reconciliation",
    "/api/admin/promos",
    "/api/admin/expenses",
    "/api/admin/shifts",
    "/api/admin/staff",
    "/api/admin/communications",
    "/api/admin/rate-plans",
    "/api/admin/blocked-dates",
    "/api/admin/testimonials",
    "/api/admin/reviews",
  ];

  type Handler = { GET?: (req: unknown) => Promise<Response> };

  for (const [path, qs] of publicRoutes) {
    const mod: Handler = await import(`../app${path}/route`);
    if (!mod.GET) continue;
    scenarios.push({
      name: path,
      group: "public api",
      run: () => mod.GET!(new NextRequest(`http://localhost:3000${path}${qs}`)),
    });
  }

  for (const path of adminRoutes) {
    let mod: Handler;
    try {
      mod = await import(`../app${path}/route`);
    } catch (e) {
      console.log(`skipped ${path} — ${e instanceof Error ? e.message.slice(0, 90) : e}`);
      continue;
    }
    if (!mod.GET) continue;
    scenarios.push({ name: path, group: "admin api", run: () => mod.GET!(adminRequest(path)) });
  }

  const selected = FILTER
    ? scenarios.filter(
        (s) => s.name.toLowerCase().includes(FILTER) || s.group.toLowerCase().includes(FILTER)
      )
    : scenarios;

  const results: Measured[] = [];
  for (const s of selected) {
    const runs: Measured[] = [];
    for (let i = 0; i < REPEAT; i++) runs.push(await measure(s));
    runs.sort((a, b) => a.wallMs - b.wallMs);
    results.push(runs[runs.length >> 1]);
    process.stdout.write(".");
  }
  console.log("\n");

  const pad = (s: string, n: number) => s.padEnd(n);
  const col = (s: string | number, w: number) => String(s).padStart(w);
  const ranked = [...results].sort((a, b) => b.trips - a.trips || b.wallMs - a.wallMs);

  console.log(pad("scenario", 36) + col("trips", 6) + col("db ms", 8) + col("wall ms", 9));
  console.log("─".repeat(62));
  let group = "";
  for (const r of ranked) {
    if (r.group !== group) {
      group = r.group;
      console.log(`\n${group}`);
    }
    const note = r.error
      ? "   ERROR " + r.error.slice(0, 44)
      : r.dupes.length
        ? "   <- repeats a statement"
        : "";
    console.log(
      pad("  " + r.name, 36) +
        col(r.trips, 6) +
        col(r.dbMs.toFixed(0), 8) +
        col(r.wallMs.toFixed(0), 9) +
        note
    );
  }

  const heaviest = ranked.filter((r) => !r.error && r.trips > 0).slice(0, 6);
  console.log("\n\nheaviest by round trips — what those trips cost at other latencies:");
  console.log(pad("", 36) + col("trips", 6) + col("@2ms", 8) + col("@10ms", 8) + col("@250ms", 9));
  for (const r of heaviest) {
    console.log(
      pad("  " + r.name, 36) +
        col(r.trips, 6) +
        col((r.trips * 2).toFixed(0), 8) +
        col((r.trips * 10).toFixed(0), 8) +
        col((r.trips * 250).toFixed(0), 9)
    );
  }

  // A statement well above the RTT floor is time Postgres spent working, and no
  // amount of moving the app closer to the database will recover it.
  const floor = rtt * 1.6;
  const slowStatements = results
    .flatMap((r) => r.slowest.map((t) => ({ scenario: r.name, ...t })))
    .filter((t) => t.ms > floor)
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 8);
  if (slowStatements.length) {
    console.log(`\n\nstatements slower than the ${rtt.toFixed(0)}ms wire floor — real query cost:`);
    for (const t of slowStatements) {
      console.log(`\n  ${t.ms.toFixed(0).padStart(6)}ms  ${t.scenario}`);
      console.log(`          ${t.sql.replace(/\s+/g, " ").slice(0, 150)}`);
    }
  }

  const repeated = ranked.filter((r) => r.dupes.length);
  if (repeated.length) {
    console.log("\n\nstatements issued more than once inside one request:");
    for (const r of repeated) {
      console.log(`\n  ${r.name}`);
      for (const d of r.dupes.slice(0, 4)) console.log(`    ${d}`);
    }
  }

  const errored = results.filter((r) => r.error);
  if (errored.length) {
    console.log(`\n\n${errored.length} scenario(s) failed to run:`);
    for (const r of errored) console.log(`  ${r.name}: ${r.error}`);
  }
}

main()
  .catch((e) => {
    console.error("FATAL", e);
    process.exitCode = 1;
  })
  .finally(() => client.$disconnect());
