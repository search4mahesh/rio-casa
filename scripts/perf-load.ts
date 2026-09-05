import "dotenv/config";

/**
 * Concurrent read load against a running server.
 *
 *   npm run build && npm start           # in one terminal
 *   npx tsx scripts/perf-load.ts         # in another
 *   npx tsx scripts/perf-load.ts --levels 1,8,32 --duration 5
 *   npx tsx scripts/perf-load.ts --only availability
 *
 * **Read-only — every request is a GET.** Nothing here books a room, so it is
 * safe against the live database. The write path has its own harness in
 * `prisma/verify-booking-race.ts`, which is deliberately separate: bookings
 * for one room serialise on a `FOR UPDATE` lock, so throughput is not the
 * question there — whether exactly one guest wins is.
 *
 * What this is actually looking for, in order:
 *
 *  - **The connection pool.** `DATABASE_POOL_MAX` (default 20) caps how many
 *    statements can be in flight per instance. Past that, requests queue for a
 *    connection and latency climbs while throughput stays flat. That knee is
 *    the number worth knowing, because it is where a busy morning at the front
 *    desk starts feeling slow.
 *  - **Round trips multiplied by concurrency.** A 10-trip endpoint holds a
 *    connection ten times longer than a 1-trip one, so it saturates the pool
 *    at a fraction of the request rate. `prisma/perf-queries.ts` says which
 *    endpoints those are; this says what they cost under load.
 *  - **Errors that only appear under contention** — `P2028`, pool timeouts,
 *    anything that reaches a visitor as "Something went wrong."
 *
 * Latency here still carries the ~250ms round trip to us-east-1, so read the
 * *shape* across concurrency levels rather than the absolute numbers: flat
 * p50 with rising throughput means headroom, rising p50 with flat throughput
 * means the pool is full.
 */

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1] ?? fallback;
};

const PORT = process.env.PORT ?? "3000";
const BASE = arg("base", `http://localhost:${PORT}`);
const LEVELS = arg("levels", "1,4,8,16,32")
  .split(",")
  .map((n) => Math.max(1, Number(n.trim())))
  .filter((n) => Number.isFinite(n));
const DURATION_MS = Math.max(1, Number(arg("duration", "4"))) * 1000;
const ONLY = arg("only", "").toLowerCase();

type Target = { label: string; path: string; trips: number; auth?: boolean };

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i];
}

async function runLevel(target: Target, concurrency: number, cookie: string | null) {
  const latencies: number[] = [];
  const statuses = new Map<number, number>();
  const failures: string[] = [];
  const deadline = Date.now() + DURATION_MS;
  const headers = target.auth && cookie ? { cookie } : undefined;

  const started = Date.now();
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      // Each worker loops until the clock runs out, so the offered load is
      // "as fast as the server will answer" rather than a fixed request count
      // that a slow level would take minutes to finish.
      while (Date.now() < deadline) {
        const t = performance.now();
        try {
          const res = await fetch(BASE + target.path, { headers });
          await res.arrayBuffer();
          latencies.push(performance.now() - t);
          statuses.set(res.status, (statuses.get(res.status) ?? 0) + 1);
        } catch (e) {
          latencies.push(performance.now() - t);
          const msg = e instanceof Error ? e.message : String(e);
          if (failures.length < 5) failures.push(msg.slice(0, 80));
          statuses.set(0, (statuses.get(0) ?? 0) + 1);
        }
      }
    })
  );
  const elapsed = (Date.now() - started) / 1000;

  latencies.sort((a, b) => a - b);
  const ok = [...statuses.entries()].filter(([s]) => s >= 200 && s < 400).reduce((a, [, n]) => a + n, 0);
  const bad = [...statuses.entries()].filter(([s]) => s === 0 || s >= 400);

  return {
    concurrency,
    requests: latencies.length,
    rps: latencies.length / elapsed,
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    p99: percentile(latencies, 99),
    max: latencies[latencies.length - 1] ?? 0,
    ok,
    bad,
    failures,
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
    select: { id: true, roomType: true },
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

  // Trip counts come from `prisma/perf-queries.ts`, so the two harnesses
  // describe the same endpoints in the same terms.
  const targets: Target[] = [
    { label: "home (prerendered)", path: "/", trips: 0 },
    { label: "rooms + dates", path: `/rooms?checkIn=${checkIn}&checkOut=${checkOut}`, trips: 7 },
    ...(room
      ? [
          {
            label: "availability",
            path: `/api/booking/availability?roomId=${room.id}&checkIn=${checkIn}&checkOut=${checkOut}`,
            trips: 2,
          },
        ]
      : []),
    { label: "night-audit summary", path: "/api/admin/night-audit/summary", trips: 10, auth: true },
  ];

  const selected = ONLY ? targets.filter((t) => t.label.toLowerCase().includes(ONLY)) : targets;

  console.log(`base       ${BASE}`);
  console.log(`levels     ${LEVELS.join(", ")} concurrent, ${DURATION_MS / 1000}s each`);
  console.log(`pool       DATABASE_POOL_MAX=${process.env.DATABASE_POOL_MAX ?? "20 (default)"}\n`);

  const col = (s: string | number, w: number) => String(s).padStart(w);

  for (const target of selected) {
    console.log(`\n${target.label}  —  ${target.trips} db round trip(s) per request`);
    console.log(`${target.path.slice(0, 76)}`);
    console.log(
      col("conc", 6) + col("req", 7) + col("req/s", 9) + col("p50", 9) + col("p95", 9) + col("p99", 9) + col("max", 9) + "   status"
    );
    console.log("─".repeat(76));

    for (const level of LEVELS) {
      const r = await runLevel(target, level, cookie);
      const status =
        r.bad.length === 0
          ? "all ok"
          : r.bad.map(([s, n]) => `${s === 0 ? "conn-fail" : s}x${n}`).join(" ");
      console.log(
        col(r.concurrency, 6) +
          col(r.requests, 7) +
          col(r.rps.toFixed(1), 9) +
          col(r.p50.toFixed(0), 9) +
          col(r.p95.toFixed(0), 9) +
          col(r.p99.toFixed(0), 9) +
          col(r.max.toFixed(0), 9) +
          "   " +
          status
      );
      for (const f of r.failures) console.log(`        ! ${f}`);
    }
  }

  console.log(
    `\nRead the shape, not the absolutes: rising req/s with a flat p50 is headroom;` +
      `\na flat req/s with a climbing p50 means requests are queueing for a connection.`
  );
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exitCode = 1;
});
