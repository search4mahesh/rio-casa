import { NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────
// The API response envelope.
//
// Every admin/public route answers in exactly one of three shapes:
//
//   { success: true,  data: <payload> }   — carries data
//   { success: true,  message: string }   — pure acknowledgement
//   { success: false, error: string }     — failure
//
// Before these helpers existed each route hand-wrote its own object,
// and the payload key drifted to whatever the handler happened to call
// its variable — `promos`, `plan`, `booking`, `kpi`. Clients then had
// to know a different key per endpoint.
//
// `error` is always a plain string. Returning a Zod error object here
// used to render "[object Object]" in the admin UI, because every
// caller does `data.error ?? "..."` straight into a toast.
// ─────────────────────────────────────────────────────────────

/** Success with a payload. */
export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

/** Success with nothing to return but a human-readable confirmation. */
export function okMessage(message: string, status = 200) {
  return NextResponse.json({ success: true, message }, { status });
}

/** Success with no body at all — deletes and similar. */
export function okEmpty(status = 200) {
  return NextResponse.json({ success: true }, { status });
}

/** Failure. `error` is always a string so clients can render it directly. */
export function fail(error: string, status = 400) {
  return NextResponse.json({ success: false, error }, { status });
}

/**
 * Failure built from a Zod parse result — flattens to the first
 * human-readable issue rather than dumping the error object.
 */
export function failValidation(
  err: { issues?: Array<{ message?: string }> },
  status = 400
) {
  return fail(err.issues?.[0]?.message ?? "Invalid input", status);
}
