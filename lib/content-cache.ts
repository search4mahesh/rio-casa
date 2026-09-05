import { unstable_cache } from "next/cache";

/**
 * How long the public site may serve content it has not re-read.
 *
 * B-74 was the opposite mistake: the home page was statically prerendered at
 * build, so approving a testimonial or repricing a room changed nothing a
 * visitor saw *until the next deploy*. `force-dynamic` fixed that by reading
 * the database on every request — correct, but it means every visitor pays for
 * it, and the pool closes idle connections after 30s. On a property this quiet
 * a typical visitor arriving from a search result is the one who pays the
 * ~1.9s TLS handshake, on the page that forms their first impression.
 *
 * Time-based revalidation sits between those. A minute-old testimonial is not
 * a defect; a minute-old *price* is not either, since nothing can be booked
 * without `/api/booking/quote` pricing it live.
 *
 * **Time, not tags, is the floor — and that is deliberate.** Nothing in this
 * application writes rooms, gallery images or blog posts: they change through
 * `prisma/seed-content.ts`, `seed-rooms.ts` or someone in Prisma Studio. A
 * cache invalidated only by `revalidateTag` would therefore never be
 * invalidated for any of them, and content edited by a script would be stale
 * for as long as the instance lived — B-74 again, with a longer fuse. A TTL
 * needs no writer to remember anything.
 *
 * Tags are layered on top for the one thing that *does* have an in-app writer,
 * so an approved testimonial appears at once rather than within the minute.
 */
export const CONTENT_REVALIDATE_SECONDS = 60;

/**
 * Invalidated by `/api/admin/testimonials` on approve, edit and delete.
 *
 * A tag rather than `revalidatePath`, because these pages live under
 * `app/[locale]/` and the path a visitor sees (`/`) is not the path Next knows
 * the route by. Tags do not care.
 */
export const TESTIMONIALS_TAG = "testimonials";

/** Invalidated by nothing today — see the note above about who writes rooms. */
export const ROOM_CATALOGUE_TAG = "room-catalogue";

/**
 * `unstable_cache`, but usable outside a request.
 *
 * Next's data cache only exists inside a server request: called from anywhere
 * else, `unstable_cache` throws `Invariant: incrementalCache missing`. That
 * matters here because the cached readers are not only called by pages —
 * `prisma/perf-queries.ts` runs the real page-data functions in-process to
 * count round trips, and the `prisma/verify-*.ts` scripts import app code the
 * same way. Wrapping the readers without this made four of the profiler's
 * scenarios error out instead of reporting a number.
 *
 * Outside a request there is no cache to consult and nothing to share the
 * result with, so reading straight through is both the only option and the
 * right one: a script wants the current row, not a remembered one.
 */
export function cachedRead<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  keyParts: string[],
  options: { tags: string[]; revalidate: number }
): (...args: A) => Promise<R> {
  const cached = unstable_cache(fn, keyParts, options);
  return async (...args: A) => {
    try {
      return await cached(...args);
    } catch (err) {
      if (err instanceof Error && err.message.includes("incrementalCache")) {
        return fn(...args);
      }
      throw err;
    }
  };
}
