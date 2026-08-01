import "dotenv/config";
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Prisma client for the standalone scripts in this folder (seeds, repairs).
 *
 * Two Prisma 7 requirements are handled here so each script does not repeat
 * them:
 *  - a driver adapter is mandatory; `new PrismaClient()` no longer compiles
 *  - `.env` is no longer loaded automatically, so `DATABASE_URL` would be
 *    undefined without the `dotenv/config` import above
 *
 * The app runtime uses `@/lib/prisma` instead — that one is a hot-reload-safe
 * singleton and deliberately does not read `.env` itself.
 */
export function makeScriptClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set — check .env");
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}
