// ─────────────────────────────────────────────────────────────
// Query-string parsing for route handlers.
//
// `parseInt` returns NaN for anything unparseable, and NaN then propagates
// silently: `Math.max(1, parseInt("abc"))` is NaN, not 1, so `skip: NaN`
// reached Prisma and the route died with an empty 500 (B-41). Bodies are
// validated with Zod; query params get this.
// ─────────────────────────────────────────────────────────────

/**
 * A positive integer from a query param, never NaN.
 *
 * Anything unparseable — missing, "abc", "" — falls back to `fallback`
 * rather than erroring: a bad page number is not worth refusing a request
 * over, it just means page 1.
 */
export function positiveIntParam(raw: string | null, fallback = 1, max = Number.MAX_SAFE_INTEGER): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(1, n));
}
