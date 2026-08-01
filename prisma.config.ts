import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma 7 CLI configuration.
 *
 * Two things moved here from convention/implicit behaviour:
 *  - the schema and migrations locations, which used to be inferred
 *  - loading `.env`, which Prisma no longer does automatically (hence the
 *    `dotenv/config` import above — without it `DATABASE_URL` is undefined and
 *    every CLI command fails with a confusing connection error)
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  // Prisma 7 removed `url` from the datasource block. Migrate reads it here;
  // the runtime gets it through the adapter in lib/prisma.ts instead.
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
