import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Prisma 7 requires a driver adapter — there is no built-in connection layer
 * any more, which is what lets the client ship without the Rust query engine.
 *
 * `DATABASE_URL` points at Neon's pooler, which is what the app runtime wants.
 * Migrations are a different matter: they need the direct endpoint (hostname
 * without `-pooler`) plus `PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1`. See CLAUDE.md.
 */
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createClient() {
  const adapter = new PrismaPg({
    connectionString,
    // `createBooking` holds a SERIALIZABLE transaction with a `FOR UPDATE` lock
    // on the room row, so concurrent bookings for the same room queue up. The
    // node-postgres default pool (10) starves under that: waiters could not even
    // open a transaction and failed with P2028 instead of a useful message.
    max: Number(process.env.DATABASE_POOL_MAX ?? 20),
    // Don't let a waiter sit forever if the pool really is saturated.
    connectionTimeoutMillis: 15_000,
    idleTimeoutMillis: 30_000,
  });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
