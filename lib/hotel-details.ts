// ─────────────────────────────────────────────────────────────
// The GST-registered details this property bills under.
//
// These were three `process.env.X || "<placeholder>"` expressions, and the
// GSTIN placeholder — `27XXXXX0000X1ZX` — was snapshotted onto every `Invoice`
// row at check-out and printed on the tax invoice handed to the guest (B-62).
// A tax document carrying a fake GSTIN is a compliance problem, and because
// the value is snapshotted it cannot be corrected later by setting the
// variable.
//
// So this fails **shut**, like `JWT_SECRET` and `CRON_SECRET`: in production a
// missing, placeholder or malformed GSTIN throws rather than invoicing under a
// number that is not the property's. `generateInvoice` is already called from
// a try/catch that treats it as bookkeeping — check-out still completes, the
// room is still freed, and the guest still leaves. What does not happen is a
// wrong tax invoice.
//
// Resolved per call rather than at module load, for the same reason as
// `secret()` in lib/admin-auth.ts: throwing at import time would take
// `next build` down whenever the build environment lacks the variable, which
// is a different problem from a misconfigured deployment.
// ─────────────────────────────────────────────────────────────

/**
 * The shape of an Indian GSTIN: two-digit state code, ten-character PAN, an
 * entity digit, a literal `Z`, and a checksum character.
 *
 * Bracket classes rather than `\d` — the same habit migration SQL needs here
 * (B-22), and harmless in JavaScript.
 */
import { PROPERTY } from "@/lib/property";

export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;

/**
 * The placeholder that shipped as the fallback.
 *
 * It has to be rejected **by value**, not just by shape: it is a
 * well-formed GSTIN as far as the pattern is concerned, and `.env` had it set
 * explicitly rather than left blank — so a check for "unset" alone would have
 * passed it straight through.
 */
export const PLACEHOLDER_GSTIN = "27XXXXX0000X1ZX";

export function isGstin(value: string | undefined | null): value is string {
  if (!value) return false;
  const trimmed = value.trim().toUpperCase();
  return trimmed !== PLACEHOLDER_GSTIN && GSTIN_PATTERN.test(trimmed);
}

export interface HotelBillingDetails {
  gstin: string;
  name: string;
  address: string;
}

/** Why the configured GSTIN cannot be billed under, or null if it can. */
export function gstinProblem(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return "HOTEL_GSTIN is not set";
  if (value.toUpperCase() === PLACEHOLDER_GSTIN) {
    return `HOTEL_GSTIN is still the placeholder ${PLACEHOLDER_GSTIN}`;
  }
  if (!GSTIN_PATTERN.test(value.toUpperCase())) {
    return `HOTEL_GSTIN ${JSON.stringify(value)} is not a valid GSTIN`;
  }
  return null;
}

/**
 * Billing details for an invoice about to be written.
 *
 * Throws in production when the GSTIN is unusable. Outside production it falls
 * back to the placeholder so a developer can generate invoices against seed
 * data — the same shape as the committed `JWT_SECRET` development fallback,
 * and unreachable in production for the same reason.
 */
export function hotelBillingDetails(): HotelBillingDetails {
  const problem = gstinProblem(process.env.HOTEL_GSTIN);

  if (problem) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        `${problem} — refusing to write a tax invoice under a GSTIN that is not the property's. ` +
          `Set HOTEL_GSTIN in the deployment environment.`
      );
    }
    console.warn(`[hotel-details] ${problem}; using the development placeholder.`);
  }

  return {
    gstin: (problem ? PLACEHOLDER_GSTIN : process.env.HOTEL_GSTIN!.trim().toUpperCase()),
    name: process.env.HOTEL_NAME?.trim() || PROPERTY.billingName,
    address: process.env.HOTEL_ADDRESS?.trim() || PROPERTY.billingAddress,
  };
}

/**
 * What `/admin/setup` shows in its Hotel Information card.
 *
 * Never throws — a misconfigured GSTIN should be *visible* on the settings
 * page, which is the one screen whose job is to show it. Returning the problem
 * lets the panel say so rather than displaying a plausible-looking fake and
 * leaving staff to discover it on a guest's invoice.
 */
export function hotelDetailsForDisplay(): HotelBillingDetails & { problem: string | null } {
  const problem = gstinProblem(process.env.HOTEL_GSTIN);
  return {
    gstin: problem ? "" : process.env.HOTEL_GSTIN!.trim().toUpperCase(),
    name: process.env.HOTEL_NAME?.trim() || PROPERTY.billingName,
    address: process.env.HOTEL_ADDRESS?.trim() || PROPERTY.billingAddress,
    problem,
  };
}
