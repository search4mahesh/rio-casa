// ─────────────────────────────────────────────────────────────
// Browser-side companion to lib/api-response.ts.
//
// That module defines the envelope every route answers in; this one reads it
// back safely. Every admin panel used to write the same two lines:
//
//   const res  = await fetch(url);
//   const data = await res.json();      // ← throws on an empty body
//   if (data.success) setThing(data.data);
//   setLoading(false);                  // ← never runs when it throws
//
// Both failure modes are real. `fetch` rejects outright when the network
// drops, and `res.json()` throws on an empty body — which is exactly what an
// unhandled route error returns (B-41). Either way the `setLoading(false)`
// below never ran, and the panel sat on "Loading…" until the page was
// reloaded: no error, no retry, nothing to click (B-39). B-14 fixed this for
// `WalkInModal` alone; this is the same fix everywhere else.
//
// CLAUDE.md already states the rule for the guest wizard — "Parse with
// `.catch(() => null)` and fall back to your own message". This puts it in one
// place so a panel cannot forget it.
//
// `apiJson` never throws and never rejects. It resolves to the same envelope
// the route would have sent, so a call site keeps reading `data.success`,
// `data.data` and `data.error` exactly as before — and `error` is now always a
// string, even when the response had no body to take one from.
// ─────────────────────────────────────────────────────────────

/**
 * The envelope from lib/api-response.ts, as the browser sees it.
 *
 * Discriminated on `success`, so `if (data.success)` narrows `data.data` to
 * `T` and the failure branch always has a string in `error`.
 */
export type ApiEnvelope<T> =
  | { success: true; data: T; message?: string; error?: undefined }
  | { success: false; error: string; data?: undefined; message?: undefined };

/** Shown when the request never reached the server at all. */
const NETWORK_ERROR = "Could not reach the server — check your connection and try again.";

/**
 * Message for a response that carried no usable `error` string of its own.
 *
 * A route that fails before it can shape a response returns an empty body, so
 * there is nothing to render; these say something true about the status code
 * instead of putting "undefined" in front of staff.
 */
function statusMessage(status: number): string {
  if (status === 401) return "Your session has expired — please sign in again.";
  if (status === 403) return "You do not have permission to do that.";
  if (status === 404) return "Not found.";
  if (status >= 500) return "The server ran into a problem. Please try again.";
  return "Something went wrong. Please try again.";
}

/**
 * `fetch` + `res.json()` in one call that cannot throw.
 *
 * `T` defaults to `any` to match what `res.json()` already gave these call
 * sites — this replaced 59 of them, and narrowing the payload type is a
 * separate job from stopping the panels hanging. Pass it explicitly in new
 * code: `apiJson<Promo[]>(url)`.
 *
 * ```ts
 * const data = await apiJson<Promo[]>("/api/admin/promos");
 * if (data.success) setPromos(data.data);
 * else setLoadError(data.error);
 * setLoading(false);            // always reached
 * ```
 */
export async function apiJson<T = any>(
  input: string,
  init?: RequestInit
): Promise<ApiEnvelope<T>> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    // Offline, DNS failure, request aborted — never reached the server.
    return { success: false, error: NETWORK_ERROR };
  }

  // An unhandled route error returns an empty 500, so this is `null` rather
  // than an exception that would skip the caller's cleanup.
  const body = (await res.json().catch(() => null)) as
    | { success?: boolean; data?: T; message?: string; error?: unknown }
    | null;

  if (!body || typeof body !== "object") {
    return { success: false, error: statusMessage(res.status) };
  }

  if (body.success) {
    return { success: true, data: body.data as T, message: body.message };
  }

  // `error` is a string by contract. Anything else — including a body that
  // omitted it entirely — falls back to something readable rather than
  // rendering "[object Object]" or "undefined".
  return {
    success: false,
    error: typeof body.error === "string" && body.error ? body.error : statusMessage(res.status),
  };
}
