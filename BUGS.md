# Rio Casa — Bug Ledger

Known defects, and the ones already dealt with. Opened 2026-08-01 from a
read-through of `lib/`, all 48 API routes, the Prisma schema and migrations,
and the booking wizard.

**Keep this current.** Add a row when you find something you are not fixing in
the same change; move it to [Fixed](#fixed) with the commit when you do. An
entry that turns out to be wrong gets deleted, not left to rot — a ledger
nobody trusts is worse than none.

Each entry states the **failure**, not just the smell: what input produces what
wrong output. If you cannot write that line, it is a code-quality note and
belongs in a `/simplify` pass instead.

IDs are stable and safe to cite in commit messages (`fix(booking): … (B-07)`).

Severity:
- **Critical** — money moves wrongly, data is lost, or auth is bypassable
- **High** — guests or staff see wrong information and act on it
- **Medium** — wrong in a specific configuration, or two screens disagree
- **Low** — cosmetic, latent, or a documented feature with no way to reach it

---

## Open

Nothing open. Every entry below has been fixed and verified.

---

## Fixed

| ID | Severity | Summary | Fixed in |
|---|---|---|---|
| B-01 | Critical | Any valid Razorpay signature could mark **any** booking paid | `app/api/payment/verify/route.ts` |
| B-02 | Critical | Wizard quoted `pricePerNight × nights`; Razorpay charged GST + weekend markup | `app/api/booking/quote/route.ts`, `components/booking/BookingWizard.tsx` |
| B-03 | Critical | An abandoned checkout held its room until the stay was over | `expireStalePaymentHolds()`, `app/api/cron/expire-holds/route.ts` |
| B-07 | Critical | `JWT_SECRET` fell back to a committed string in production | `lib/admin-auth.ts` |
| B-04 | High | Cron night audit only ever looked at yesterday, so a skipped run was permanent | `runNightAudit()` in `lib/booking-service.ts` |
| B-05 | High | `claimPromo` never checked `minAmount` | `claimPromo` in `lib/booking-service.ts` |
| B-06 | High | A flat discount larger than the stay produced a negative Razorpay amount | `claimPromo` + `applyGst` in `lib/booking-service.ts` |
| B-08 | Medium | Local-midnight bounds against DATE columns in four admin routes | calendar, expenses, reconciliation, laundry routes |
| B-09 | Medium | Monthly occupancy counted nights outside the report window | `app/api/admin/reports/route.ts` |
| B-10 | Medium | Blocking the same range twice created duplicate rows | `prisma/migrations/3_blocked_dates_unique`, `app/api/admin/blocked-dates/route.ts` |
| B-11 | Medium | "Cancel batch" hard-deleted the batch and its item lines | `app/api/admin/laundry/[id]/route.ts` |
| B-20 | Medium | Monthly revenue dropped stays checking in before the window; ADR mixed whole-stay revenue with clipped nights | `app/api/admin/reports/route.ts` |
| B-21 | Medium | Laundry batch numbers used `COUNT(*)`, colliding on same-day dispatches | `prisma/migrations/4_daily_counters`, `nextDailyNumber()` |
| B-17 | Medium | A Resend outage 500'd `/api/payment/verify` *after* recording the payment | `app/api/payment/verify/route.ts` |
| B-12 | Low | The rate-override feature had no UI — the desk could not negotiate a rate | `components/admin/WalkInModal.tsx` |
| B-13 | Low | Walk-in dates defaulted to the UTC day, so before 05:30 IST they were yesterday | `components/admin/WalkInModal.tsx` |
| B-14 | Low | Walk-in modal swallowed network errors and sat there looking idle | `components/admin/WalkInModal.tsx` |
| B-15 | Low | `addMonths` overflowed 31 Jan into 3 March | `lib/dates.ts` |
| B-16 | Low | `CHANNEL-MANAGER-PLAN.md` was referenced but did not exist | `CHANNEL-MANAGER-PLAN.md` |
| B-18 | Low | Wizard sent Razorpay a fractional-paisa amount (`11800.5 * 100`) | `components/booking/BookingWizard.tsx` |
| B-19 | Low | "Confirm Booking" re-enabled while the Razorpay modal was open | `components/booking/BookingWizard.tsx` |
| B-22 | Low | `\d` in migration regex matches nothing here, so a backfill no-ops silently | `__tests__/unit/lib/migration-sql.test.ts` (guard) |

Details on the four Critical fixes — including the two guards that keep the
hold sweeper from cancelling a paid stay — are in CLAUDE.md under
**Booking Flow**. They are documented there rather than here because they
describe how the system now works, not what is wrong with it.

Notes on the rest:

- **B-06** is fixed in two places on purpose. `claimPromo` clamps the discount
  it hands back, and `applyGst` floors `taxableAmount` at zero regardless of
  who calls it — that function's output becomes a Razorpay order amount, so it
  should not be able to return a negative no matter what is passed in.
- **B-08** also fixed the two month defaults that read the *server's* month
  (`new Date().getMonth()`) rather than the property's. On Vercel, which runs
  UTC, that opened reconciliation and the calendar to the previous month for
  the first five and a half hours of every 1st.
- **B-09** additionally changed the `occupancyPct` denominator to the days of
  each month that fall inside the report window. Clamping the numerator alone
  would have made every partial edge month read as near-empty.
- **B-10** needed a migration. Two *partial* unique indexes, not one plain
  `UNIQUE`: `room_id` is nullable and means "every room", and Postgres treats
  NULLs as distinct in a normal unique index, so property-wide blocks would
  have gone on duplicating freely. Applied to Neon on 2026-08-01; the table was
  empty, so the migration's de-duplicating `DELETE` was a no-op.
- **B-11** also excludes cancelled batches from `summary.totalCost` and hides
  the cancel button once pieces have come back, since the API now refuses that.
- **B-20 changes reported figures, and that was the point.** Revenue is now
  earned per night and measured over the same nights as occupancy. A range
  covering whole months is bit-for-bit unchanged; a range that *clips* a stay
  now reports that stay's in-window share. The second half was ADR: dividing
  whole-stay revenue by clipped nights made a 30-night ₹30,000 booking clipped
  to 5 nights report ₹6,000 a night instead of ₹1,000. `monthlyBookings` is
  likewise bucketed by the first in-window night, so the bars sum to
  `totalBookings` instead of quietly dropping early arrivals.
- **B-21 generalised `booking_counters` into `daily_counters`** rather than
  giving laundry its own table. Two copies of an allocator is how the walk-in
  and website booking paths drifted apart, and that lesson is the reason this
  file exists. Migration `4_daily_counters` copies the 85 existing booking rows
  across, backfills laundry from the numbers already issued, and drops the old
  table — one transaction, so it cannot half-apply. **Deploy it with the code:**
  the old code reads a table it removes.
- **B-15 clamps rather than returning a month start.** The docstring claimed
  "first day of the month n months after day", which is true of every caller
  that passes a month start but not of `reports`, which shifts an arbitrary end
  date by −12 months. Clamping (31 Jan +1 → 28 Feb) makes the name honest for
  both. `startOfMonth` remains the way to ask for a boundary.
- **B-22 is closed by a guard, not by an edit.** Prisma checksums applied
  migrations, so correcting the `\d` in `2_booking_counter` would make
  `migrate deploy` refuse to run against every database that already has it.
  `4_daily_counters` re-runs that backfill correctly, and
  `__tests__/unit/lib/migration-sql.test.ts` now fails the build if any new
  migration uses `\d`, `\s` or `\w` in a regex. `2_booking_counter` is
  explicitly grandfathered there, with the reason recorded next to it.
- **B-12/B-13/B-14 moved the walk-in modal to `components/admin/WalkInModal.tsx`.**
  It could not be tested where it was: Next.js page modules may only export
  `default` and a fixed set of names, so exporting the component for a test
  broke the build. Extracting it was the fix, and the page lost 200 lines.

- **B-23 was 70 label/control pairs across 14 files**, applied by codemod and
  verified in a real browser: clicking a label focuses its control on the login
  page, the expense form, the walk-in modal and the rate-plan modal, with no
  unlabelled or dangling labels left anywhere.

  Ids come from React's `useId()`, not from the label text, so a form rendered
  twice on one page cannot collide. Three shapes needed different treatment and
  a blind codemod would have corrupted two of them:

  | Shape | Treatment |
  |---|---|
  | `<label>Text</label>` + one control | `htmlFor`/`id` pair |
  | `<label>` wrapping its own control (RoomBoard radios) | already correct, left alone |
  | `<label>` over a *group* (radio sets, button rows) | `<span>` + `role="radiogroup"`/`"group"` + `aria-labelledby` |

  The last one matters: a `<label>` that names a group names *nothing*, which
  is worse than no label. `components/ui/Field.tsx` now owns the pattern via a
  render prop — there is no way to render the control without being handed the
  id it must carry — and the two hand-rolled `field()` helpers in Laundry and
  WalkInModal were deleted in favour of it.

### Deliberately not fixed

- **B-19 (partial).** The submit button no longer re-enables mid-checkout, but
  the wizard still creates a booking per attempt. A guest who abandons and
  retries leaves a hold behind; B-03's sweeper now cleans that up rather than
  the wizard preventing it.
- **Clickable `<div>`s in RoomBoard.** Room cards use `<div onClick>` rather
  than a button, so they cannot be reached or activated by keyboard. Noticed
  while driving the page in Playwright (`getByRole("button")` could not find
  them). Same family as B-23 but a different fix; logged here rather than
  silently widening that change.
- **UPI holds.** `expireStalePaymentHolds` sweeps UPI bookings after
  `BOOKING_HOLD_MINUTES` (60), though the confirmation screen promises staff
  will confirm a transfer within 15 minutes. Distinguishing them properly means
  threading the chosen payment method through `/api/booking/create`. Raise the
  env var if staff routinely take longer.
