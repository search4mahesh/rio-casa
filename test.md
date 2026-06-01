# Rio Casa — Full Application Test Plan & Results

**Scope:** Every public website path + every admin tool path (pages + API endpoints)
**Method:** Live HTTP against `npm run dev` on localhost:3000, against the Neon database
**Auth:** Admin cookie via `POST /api/admin/auth/login` (admin@riocasa.in / admin123)
**Runner:** `__test_fullapp.mjs` (self-bootstrapping — discovers real ids from list endpoints)

Legend: ✅ pass · ❌ fail · ⊘ skipped (env/seed limitation)

---

## PART A — Public Website

### A1. Public page loads (expect 200 HTML)
| ID | Path | Expect |
|---|---|---|
| P1 | `/` (home) | 200 |
| P2 | `/about` | 200 |
| P3 | `/rooms` | 200 |
| P4 | `/dining` | 200 |
| P5 | `/gallery` | 200 |
| P6 | `/packages` | 200 |
| P7 | `/blog` | 200 |
| P8 | `/booking` | 200 |
| P9 | `/booking/confirmation` | 200 (no id → graceful) |
| P10 | `/rooms/deluxe-room` | 200 |
| P11 | `/rooms/premium-room` | 200 |
| P12 | `/rooms/family-room` | 200 |
| P13 | `/rooms/nonexistent-slug` | 404 |

### A2. Locale handling (English-only, clean URLs)
| ID | Path | Expect |
|---|---|---|
| L1 | `/en` | redirect or 200 (no broken state) |
| L2 | `/hi` | 404 (Hindi removed) |
| L3 | `/mr/rooms` | 404 (Marathi removed) |

### A3. Public APIs
| ID | Call | Expect |
|---|---|---|
| AV1 | `GET /api/booking/availability` (no params) | 400 |
| AV2 | `GET /api/booking/availability?checkIn=bad&checkOut=bad` | 400 invalid date |
| AV3 | `GET /api/booking/availability?checkIn=2026-07-10&checkOut=2026-07-10` | 400 (checkOut not after checkIn) |
| AV4 | `GET /api/booking/availability?checkIn=2026-07-10&checkOut=2026-07-12` | 200 + rooms array |
| AV5 | `GET /api/booking/availability?roomId=<real>&...` | 200 single-room result |
| BC1 | `POST /api/booking/create` (empty body) | 400 |
| BC2 | `POST /api/booking/create` (bad email) | 400 |
| CT1 | `POST /api/contact` (valid) | 200 |
| CT2 | `POST /api/contact` (name too short) | 400 |
| CT3 | `POST /api/contact` (message < 10 chars) | 400 |
| PV1 | `POST /api/payment/verify` (invalid payload) | 400 |
| PV2 | `POST /api/payment/verify` (bad signature) | 400 verification failed |

---

## PART B — Admin Authentication

| ID | Call | Expect |
|---|---|---|
| AU1 | `POST /api/admin/auth/login` wrong password | 401 |
| AU2 | `POST /api/admin/auth/login` unknown email | 401 |
| AU3 | `POST /api/admin/auth/login` valid | 200 + Set-Cookie admin_token |
| AU4 | `GET /api/admin/auth/me` without cookie | 401 |
| AU5 | `GET /api/admin/auth/me` with cookie | 200 + staff |
| AU6 | `GET /admin/dashboard` without cookie | redirect to /admin/login (3xx) |
| AU7 | `POST /api/admin/auth/logout` | 200 |

---

## PART C — Admin Page Loads (with auth, expect 200)

| ID | Path |
|---|---|
| AP1 | `/admin/login` (public) |
| AP2 | `/admin/dashboard` |
| AP3 | `/admin/rooms` (Front Desk) |
| AP4 | `/admin/bookings` |
| AP5 | `/admin/bookings/[id]` (real id) |
| AP6 | `/admin/guests` |
| AP7 | `/admin/guests/[id]` (real id) |
| AP8 | `/admin/housekeeping` |
| AP9 | `/admin/blocked-dates` |
| AP10 | `/admin/calendar` |
| AP11 | `/admin/night-audit` |
| AP12 | `/admin/rate-plans` |
| AP13 | `/admin/promos` |
| AP14 | `/admin/invoices` |
| AP15 | `/admin/invoices/[id]/print` (real id) |
| AP16 | `/admin/expenses` |
| AP17 | `/admin/reconciliation` |
| AP18 | `/admin/reports` |
| AP19 | `/admin/communications` |
| AP20 | `/admin/reviews` |
| AP21 | `/admin/shifts` |
| AP22 | `/admin/settings` |

---

## PART D — Admin API endpoints

### D1. GET list endpoints (with auth → 200)
| ID | Call |
|---|---|
| G1 | `GET /api/admin/bookings` |
| G2 | `GET /api/admin/guests` |
| G3 | `GET /api/admin/invoices` |
| G4 | `GET /api/admin/occupancy` |
| G5 | `GET /api/admin/calendar?month=2026-07` |
| G6 | `GET /api/admin/reports` |
| G7 | `GET /api/admin/reconciliation` |
| G8 | `GET /api/admin/expenses` |
| G9 | `GET /api/admin/housekeeping` |
| G10 | `GET /api/admin/rooms/status` |
| G11 | `GET /api/admin/rate-plans` |
| G12 | `GET /api/admin/promos` |
| G13 | `GET /api/admin/reviews` |
| G14 | `GET /api/admin/shifts?weekStart=<monday>` |
| G15 | `GET /api/admin/night-audit/summary` |
| G16 | `GET /api/admin/blocked-dates` |
| G17 | `GET /api/admin/staff` |
| G18 | `GET /api/admin/communications` |

### D2. Auth gating (no cookie → 401) — sampled across modules
| ID | Call |
|---|---|
| Z1 | `GET /api/admin/bookings` |
| Z2 | `GET /api/admin/guests` |
| Z3 | `GET /api/admin/reports` |
| Z4 | `GET /api/admin/expenses` |
| Z5 | `GET /api/admin/staff` |
| Z6 | `GET /api/admin/occupancy` |
| Z7 | `GET /api/admin/rate-plans` |
| Z8 | `GET /api/admin/night-audit/summary` |

### D3. Detail endpoints (real ids)
| ID | Call | Expect |
|---|---|---|
| DT1 | `GET /api/admin/bookings/[id]` | 200 |
| DT2 | `GET /api/admin/guests/[id]` | 200 |
| DT3 | `GET /api/admin/invoices/[id]` | 200 or 404 if none |
| DT4 | `GET /api/admin/bookings/[bad-id]` | 404 |
| DT5 | `GET /api/admin/guests/[bad-id]` | 404 |

### D4. Write validation (sampled — exercises Zod without mutating real data destructively)
| ID | Call | Expect |
|---|---|---|
| W1 | `POST /api/admin/expenses` invalid category | 400 |
| W2 | `POST /api/admin/rate-plans` missing fields | 400 |
| W3 | `POST /api/admin/promos` bad discountType | 400 |
| W4 | `POST /api/admin/blocked-dates` end<start | 400 |
| W5 | `POST /api/admin/staff` bad email | 400 |
| W6 | `POST /api/admin/night-audit/run` (no body) | 200 (idempotent audit) |

---

## PART E — Cron routes (Bearer secret required)

| ID | Call | Expect |
|---|---|---|
| CR1 | `GET /api/cron/night-audit` (no auth) | 401 |
| CR2 | `GET /api/cron/detect-conflicts` (no auth) | 401 |
| CR3 | `GET /api/cron/pull-ota` (no auth) | 401 |

---

## Execution Results

**Run:** 2026-06-01 · fresh `npm run dev` · live Neon DB
**Final:** **97 passed / 0 failed** (after fixing 1 bug found during the run)

| Part | Pass | Fail | Notes |
|---|---|---|---|
| A. Public website (pages + locale + APIs) | 28 | 0 | All 13 pages 200, invalid slug 404, Hindi/Marathi 404 |
| B. Admin auth | 7 | 0 | Login gating, cookie, /me, protected redirect, logout |
| C. Admin page loads | 22 | 0 | All 22 pages 200 (incl. dynamic detail pages after fix) |
| D. Admin APIs (GET/auth/detail/validation) | 37 | 0 | 18 list, 8 auth-gating, 5 detail, 6 validation |
| E. Cron routes | 3 | 0 | All require Bearer CRON_SECRET → 401 without |

### 🐞 Bug found and FIXED during testing

**`use(params)` crash on dynamic client-component pages (Next.js 14)**

- **Symptom:** `/admin/guests/[id]` returned HTTP 500. Server log:
  `Error: An unsupported type was passed to use(): [object Object] at GuestProfilePage`
- **Root cause:** The Phase 3 guest-profile and invoice-print pages used the
  Next.js **15** params pattern — `const { id } = use(params)` with
  `params: Promise<{id}>`. But this project runs **Next.js 14.2.35**, where
  `params` in a client component is a **plain object**, not a Promise.
  `React.use()` only accepts a Promise/Context, so it threw at render.
- **Why unit tests missed it:** the bug is in the page component's param
  access, not in any API route. The 245 vitest tests cover lib + API + two
  components, not these page files. Only a live page render surfaces it.
- **Why the bookings detail page was fine:** `/admin/bookings/[id]` (pre-Phase 3)
  already used the correct Next 14 pattern `params: { id }` accessed directly.
- **Fix:** [app/admin/(protected)/guests/[id]/page.tsx](app/admin/(protected)/guests/[id]/page.tsx)
  and [app/admin/(protected)/invoices/[id]/print/page.tsx](app/admin/(protected)/invoices/[id]/print/page.tsx) —
  changed signature to `{ params }: { params: { id: string } }` and
  `const { id } = params;`, removed the `use` import.
- **Verified:** guest profile page → 200; invoice print page (fake id) → 200
  (renders "Invoice not found" gracefully). `tsc` clean. 245 unit tests pass.

### ⚠️ Process note (not an app bug)

The first run reported 19 false "500" failures on all public pages. Cause: port
3000 was occupied by a **stale dev server** from a prior session, so the fresh
server bound to **3001**. The tests hit the corrupted 3000 worker. Re-running
against the correct fresh server (3001) cleared all 19. **Lesson:** confirm the
dev server's actual port before pointing tests at it.

### Observations (not bugs)
- `/en` 307-redirects to `/` (next-intl `localePrefix: as-needed`) — correct.
- Availability for 10–12 Jul 2026 returned 12 bookable rooms (seed data).
- Payment verify correctly rejects a forged Razorpay signature (400).
- Cron endpoints are properly locked behind `CRON_SECRET`.
