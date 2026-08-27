// ─────────────────────────────────────────────────────────────
// Password policy, in one place.
//
// The length floor and the bcrypt cost were previously written into
// `POST /api/admin/staff` alone, because that was the only route that
// ever wrote a `passwordHash`. Now that a password can also be changed
// (`POST /api/admin/auth/password`), the two would drift — one route
// accepting what the other rejects — unless they read the same numbers.
// ─────────────────────────────────────────────────────────────

/**
 * Minimum length for any password this application accepts.
 *
 * Eight rather than six: the seeded accounts this replaces were six
 * (`admin123`, `hk123`), and a floor that still admits them is not
 * a floor. Applies to staff creation and to a change alike.
 */
export const MIN_PASSWORD_LENGTH = 8;

/** bcrypt work factor. Matches what the existing hashes were created with. */
export const BCRYPT_COST = 12;
