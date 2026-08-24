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

None open.

---

## Fixed

| ID | Severity | Summary | Fixed in |
|---|---|---|---|
| B-37 | Low | A Resend send that resolved with an API-level error was treated as sent everywhere except `/api/contact` | `app/api/payment/verify/route.ts`, `app/api/admin/communications/route.ts`, `app/api/admin/invoices/[id]/email/route.ts` |
| B-36 | Low | `/api/contact` was unreachable and, even if reached, only `console.log`d the inquiry | `prisma/schema.prisma`, `app/api/contact/route.ts`, `app/[locale]/contact/page.tsx`, `components/layout/Navbar.tsx`, `components/layout/Footer.tsx`, `messages/en.json` |
| B-29 | Low | `/admin/setup`'s GSTIN display always showed the placeholder fallback, never the real value | `app/admin/(protected)/setup/page.tsx`, `components/admin/panels/HotelSettings.tsx` |
| B-32 | High | Every shift saved to the day before the column it was assigned in | `components/admin/panels/Shifts.tsx` |
| B-33 | High | Reports' "Last Month" preset always excluded the month's last day | `components/admin/panels/Reports.tsx` |
| B-34 | Medium | Block-dates and add-review modals defaulted to yesterday before 05:30 IST | `components/admin/panels/BlockedDates.tsx`, `components/admin/panels/Reviews.tsx` |
| B-35 | Medium | Reconciliation and Reports showed two disagreeing "Total Revenue" figures | `app/api/admin/reconciliation/route.ts`, `lib/labels.ts`, `components/admin/panels/Reconciliation.tsx`, `components/admin/panels/Reports.tsx` |
| B-30 | High | A rate plan scoped to "All Rooms" never applied to any booking | `lib/booking-service.ts` |
| B-31 | Medium | 4 of 10 gallery room photos were captioned with room names that no longer match the inventory | `app/[locale]/gallery/page.tsx` |
| B-24 | High | Homepage "Our Rooms & Suites" links 404 for all three rooms | `components/sections/FeaturedRooms.tsx`, `lib/room-marketing.ts` |
| B-25 | High | A cancelled booking's confirmation page still said "Confirmed" / "payment pending" | `app/[locale]/booking/confirmation/page.tsx` |
| B-26 | Medium | Walk-in `amountPaid` had no upper bound — a typo overpayment was recorded as-is | `app/api/admin/bookings/create/route.ts` |
| B-27 | Low | Promo codes had no UI anywhere a guest could enter one | `components/booking/BookingWizard.tsx`, `lib/booking-service.ts`, `app/api/booking/promo/preview/route.ts` |
| B-28 | Low | Nothing in the codebase ever created an `Invoice` row | `lib/invoice-service.ts`, `app/api/admin/bookings/[id]/checkout/route.ts`, `prisma/backfill-invoices.ts` |
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

- **B-24.** `components/sections/FeaturedRooms.tsx` carried its own hardcoded
  room list — the exact failure `lib/room-marketing.ts`'s doc comment already
  named ("the site advertised a 'Premium Room' the property does not have...
  A guest could open /rooms/premium-room and press 'Book This Room'") — even
  though `app/[locale]/rooms/[slug]/page.tsx` had already been fixed to
  resolve slugs against live inventory. The homepage was never repointed at
  it, so all three "Book This Room" links there 404'd, one real room type
  (Deluxe) never appeared, and Standard/Luxury were shown under invented
  names ("Deluxe Room" / "Premium Room") at their real prices. Fixed by
  making the section `async` and sourcing cards from `getRoomCategories()` —
  the same call `/rooms` uses — instead of a local array, so it now shows all
  four live categories and can't drift again. Marketing copy still needs a
  short tagline per type that the DB doesn't hold, so `RoomMarketing` in
  `lib/room-marketing.ts` gained a `tagline` field alongside the existing
  `highlight`/`rating`/`gallery`/`longDescription`. Making the component
  `async` also meant swapping `useTranslations` (client hook) for
  `getTranslations` from `next-intl/server` — mixing an async Server
  Component with the client hook 500'd the whole homepage with "Expected a
  suspended thenable," caught by reloading `/` after the change.
- **B-25.** `app/[locale]/booking/confirmation/page.tsx` selected
  `paymentStatus` but never `status`, so its only branch —
  `paymentStatus !== "paid"` → "Payment is still pending — we will confirm as
  soon as it clears" — was equally true for a booking still awaiting payment
  and one `expireStalePaymentHolds()` had already cancelled (`status:
  "cancelled", paymentStatus: "failed"`). `BookingWizard.tsx`'s UPI path
  sends every guest to this exact URL right after `createBooking`, while the
  hold is still live, so this was directly reachable: a guest who pays
  outside the app after the 60-minute hold window, then reopens the link,
  saw reassurance for a booking whose room had already been released. Fixed
  by selecting `status` and rendering a distinct "This booking did not go
  through" screen — with the booking number and a WhatsApp link, same as the
  "booking not found" state — whenever `status === "cancelled"`, checked
  before the existing paid/pending branch.
- **B-26.** `WalkInSchema.amountPaid` only had `z.number().min(0)`, and
  nothing compared it against the computed `total` before writing the
  `Payment` row. Fixed with a check straight after `total` is known —
  `amountPaid > total` fails the request with the two figures in the message,
  same pattern as the laundry route's "returned + damaged exceeds sent"
  guard. `Payment.amount` is what the desk is crediting toward the booking,
  not cash physically tendered — change is a till concern, not this system's.
- **B-27.** Neither the booking wizard nor the walk-in modal had a
  promo-code field, despite `claimPromo`, its `minAmount` check and the
  discount clamp (B-05/B-06) all being fully built — `/admin/promos` could
  create codes no guest could ever redeem. Fixed on the booking wizard only;
  a walk-in comment already explains admin promo entry is deliberately
  absent there ("promo codes are a website thing; the desk negotiates the
  rate instead").

  The fix had to preserve the exact guarantee B-02 exists for: the guest
  never approves one number while Razorpay opens for another. `claimPromo` is
  a write (`UPDATE ... SET used_count = used_count + 1`), so it cannot run
  during a preview the same way `/api/booking/quote` cannot take a promo code
  at all — a price preview must never spend a redemption. `previewPromo`
  (`lib/booking-service.ts`) is a new, plain-`SELECT` sibling with the same
  eligibility checks, exposed at `GET /api/booking/promo/preview` for the
  wizard's "Apply" button. Because a preview can go stale before "Confirm
  Booking" (the code exhausted or expired in between), `createBooking` now
  fails the *whole* booking with `errorCode: "PROMO_INVALID"` if a submitted
  `promoCode` cannot actually be claimed, rather than its previous behaviour
  of silently falling back to full price — that fallback would have charged
  more than the total the guest had just approved.

  Building this surfaced a second bug the same testing pass would otherwise
  have shipped promo codes with: `/api/booking/create`'s Razorpay-failure
  handler voids the booking but, before this fix, never released the promo
  claim that had already committed with it — a capped code lost one
  redemption to every guest whose Razorpay order simply failed to create,
  Razorpay outage or not. `releasePromoClaimByCode` (keyed by code, since the
  route never sees the claim's internal id) closes that; verified by forcing
  two Razorpay failures against a 5-use test code and confirming
  `used_count` returned to 0 both times rather than climbing.
- **B-28.** Nothing anywhere called `prisma.invoice.create` — the schema, all
  four invoice routes, the admin panel and the print/email pages existed, but
  no booking path had ever populated one. `lib/invoice-service.ts` now
  generates an invoice from check-out (`app/api/admin/bookings/[id]/checkout/route.ts`),
  gated on `paymentStatus` being `paid` or `cash` — the same "counts as
  revenue" definition `/api/admin/reconciliation` already uses — so a
  no-show or a stay someone checked out with payment still pending gets no
  tax document. Amounts are rebuilt from what the booking actually charged
  (`totalAmount`/`cgstAmount`/`sgstAmount`/`discountAmount`), never
  re-derived from `quoteStay`/`applyGst`, so an invoice can't disagree with
  what the guest was billed. Guest details (address, GSTIN) are snapshotted
  onto the invoice at generation time, same reasoning as laundry's per-line
  rates in this file: a guest editing their profile later must not rewrite a
  tax document already handed over. Generation is idempotent — a booking
  that already has one returns it — and non-fatal, so a failure here cannot
  undo a check-out that already happened.

  `prisma/backfill-invoices.ts` (dry-run by default, `--apply` to write)
  catches up the 29 bookings that were already `checked_out` and paid before
  this existed, using its own `makeScriptClient()` rather than importing
  `lib/invoice-service.ts` — that module pulls in the app's `@/lib/prisma`
  singleton, which is not meant to run outside the Next.js process (see
  `prisma/script-client.ts`). Verified against a real checkout end-to-end —
  check-in, check-out, invoice appears in `/admin/money?tab=invoices` and
  renders correctly on the print page — and the backfill script is safe to
  re-run (confirmed a second `--apply` created zero rows).
- **B-30.** `lib/labels.ts` defines `RATE_PLAN_ROOM_TYPES = ["all",
  ...SELLABLE_ROOM_TYPES]`, and the admin form's "All Rooms" option saves
  exactly that string — but `quoteStay`'s lookup matched only
  `roomType: room.roomType`, so a plan saved that way could never be found by
  the one function every booking path prices through. It saved without error
  and silently never applied to anything, on either path. Fixed by matching
  `roomType: { in: [room.roomType, "all"] }`; if a specific-type plan and an
  "all" plan both cover the same dates, `priority` decides which wins, same
  as when two plans of the same type overlap. Verified against the live
  quote endpoint: a ₹9,999/night "All Rooms" plan changed a Standard Room's
  quoted nightly rate from its ₹4,500 base straight to ₹9,999.
- **B-31.** `app/[locale]/gallery/page.tsx` captioned photos by their
  filename's old naming convention rather than by `lib/room-marketing.ts`,
  the mapping every other page uses — `deluxe-main.jpg` and
  `deluxe-wardrobe.jpg` are captioned "Deluxe Room" there but are the
  **Standard** Room's images, and `premium-bed.jpg`/`premium-bathtub.jpg`
  are captioned "Premium Room" — a name the property doesn't have — but are
  the **Luxury** Room's. Fixed by correcting the four captions to match
  `room-marketing.ts` and noting why, so the next image added here is
  captioned by the real mapping rather than the file's name.
- **B-37.** Fixed all three remaining call sites with the same pattern
  `/api/contact` already used: destructure `{ error }` off the resolved
  `resend.emails.send(...)` value rather than trusting that a resolved promise
  means the email went out. Two of the three were more than a logging gap:
  - `app/api/admin/invoices/[id]/email/route.ts` marked the invoice `"sent"`
    and wrote an `email_invoice` audit row *after* the send call, unconditionally
    — a rejected send still told staff "Invoice emailed to X" with nothing
    delivered, and the invoice list carried a status that wasn't true. Now
    returns `502` with Resend's own message and skips both writes when `error`
    is set. Verified against the live route with the dev environment's
    placeholder key: `POST` now returns `{"error":"API key is invalid"}` / 502,
    and the invoice's `status` stayed `"generated"` with no audit row written.
  - `app/api/admin/communications/route.ts` incremented `sentCount` right after
    the `send()` call resolved, so a bad key reported "sent to N guests" for a
    campaign that reached nobody. `sentCount` now only increments when `error`
    is absent; a resolved-but-rejected send is pushed onto `errors` (same shape
    the existing thrown-error branch already used) instead.
  - `app/api/payment/verify/route.ts` only needed the logging half — B-17
    already made this path non-fatal regardless of why the send failed, so
    there was no wrong status to correct, just a silent one. Restructured the
    `.catch()` chain into `try`/`await`/`catch` because destructuring `{ error
    }` off a `.catch()`-swallowed rejection would itself throw (the handler
    returns `undefined`, and `{ error } = undefined` throws) — this is the one
    place in the fix where the mechanical substitution wasn't safe to make blind.

  Added a regression test per call site, each forcing the resolved-with-`error`
  shape rather than a thrown rejection — the exact case none of the three
  handled before. All three catch blocks for genuine network-level throws are
  untouched and still covered by the tests that already existed for them.
- **B-36.** `/api/contact` had two independent problems: nothing could reach
  it, and nothing durable happened if it were reached. Fixed both:
  - **Unreachable.** Added `app/[locale]/contact/page.tsx` (React Hook Form +
    Zod, matching `BookingWizard`'s guest-details step; labels use `useId()` +
    `htmlFor` rather than the bare `<label>` that step already has, since
    there's no reason to carry that omission into new code) and linked it from
    both `Navbar.tsx` and `Footer.tsx`'s quick links. New strings live under
    `messages/en.json`'s `contactPage` namespace, per the project's English-only
    string-store convention.
  - **Nothing durable.** The stub only `console.log`d the body. Added
    `ContactInquiry` (`prisma/schema.prisma`, migration `5_contact_inquiries`)
    and rewrote the route to `prisma.contactInquiry.create()` the submission —
    which must succeed, it's the only durable record — then best-effort email
    `EMAIL_RESORT` via Resend, non-fatal for the same reason the booking
    confirmation email in B-17 is non-fatal: the inquiry is already saved, so a
    Resend outage must not turn a successful submission into an error the guest
    sees. Verified live end-to-end: submitted the form, confirmed the row in
    `contact_inquiries`, then confirmed the (expected, dummy-key) Resend
    failure is now logged rather than silently swallowed — see B-37, found
    while checking that.

  Applying the migration needed `prisma/migrations/migration_lock.toml`, which
  turned out to be missing from the repository entirely (Prisma writes it on
  the first `migrate dev`/`migrate diff`, and this project's migrations were
  hand-authored from the start — see `0_init`'s baseline note). Recreated it
  with the standard `provider = "postgresql"` contents; every prior migration
  already assumed it.
- **B-29.** Fixed by moving the read to where a server-only var can actually be
  read: `app/admin/(protected)/setup/page.tsx` (a Server Component, same file
  that already reads `staff.role` via `verifyAdminToken`) now reads
  `process.env.HOTEL_GSTIN` and passes it into `HotelSettingsPanel` as a prop,
  instead of the panel reading `process.env.NEXT_PUBLIC_HOTEL_GSTIN` on the
  client. `HOTEL_GSTIN` was already set correctly for `lib/invoice-service.ts`
  — no deploy-config change needed, contrary to the note this entry was opened
  with. Verified by restarting the dev server with `HOTEL_GSTIN` overridden to
  a value distinct from the fallback string (`27AAAAA1111A1Z9`) and confirming
  `/admin/setup?tab=hotel` displayed exactly that — the previous code would
  have shown the fallback regardless of what the env var held.
- **B-32/B-33/B-34 are one bug, found in four places.** All three built a
  `Date` from local parts (`setHours(0,0,0,0)`, `new Date(y, m, d)`, or the
  bare `new Date()` constructor) and then serialised it with `toISOString()`,
  which reads the *UTC* day — `…T18:30:00Z` on the day before, in IST. This is
  exactly B-13's failure, which was fixed in `WalkInModal.tsx` but left
  unfixed everywhere else calendar days were built on the client:
  - **B-32** — `Shifts.tsx` rebuilt entirely on `lib/dates.ts`, staying in UTC
    end to end. `startOfWeek`/`fmtDay` now take a day already in UTC form
    rather than calling `setHours`/`getDay()` on a local `Date`, and every
    `toLocaleDateString` is pinned to `timeZone: "UTC"` so formatting a
    calendar day can't reinterpret it in the browser's zone. Verified
    end-to-end: assigning a shift to the cell under "Mon 24 Aug" now opens a
    dialog headed "Monday, 24 August" (previously "Sunday, 23 August") and the
    row lands in `shift_assignments` dated `2026-08-24` — confirmed by reading
    it straight back out of the database, not just off the screen.
  - **B-33** — `Reports.tsx`'s date-preset helpers now build every bound with
    `lib/dates.ts` (`today`, `addMonths`, `startOfMonth`, `addDays`,
    `toDayString`). "Last Month" is a new `wholeMonthAgo(n)` that derives the
    end as "the day before the next month starts" rather than a day-of-month
    literal, so it lands correctly on the 28th/29th/30th/31st without a special
    case. Verified live: clicking "Last Month" in August now requests
    `2026-07-01 → 2026-07-31` (was `→ 2026-07-30`) and the KPI card reads
    "₹4.3L" over "31 days" (was ₹4.14L over 30).
  - **B-34** — `BlockedDates.tsx` and `Reviews.tsx`'s add-item modals now default
    to `propertyDayString()`, the same helper `WalkInModal.tsx` already used for
    B-13, instead of `new Date().toISOString().split("T")[0]`.
- **B-35.** Both `/admin/money` tabs kept the same "Total Revenue" label for two
  figures computed on different bases, and one of the two bases was also
  dropping money it should have counted. The mislabeling and the miscount
  needed separate fixes:
  - The undercount: `reconciliation`'s query filtered on
    `paymentStatus in (paid, cash)` alone, which silently excludes every OTA
    booking — those stay `pending` for their whole life because the guest paid
    the channel, not us (documented behaviour; `expireStalePaymentHolds` in
    CLAUDE.md already carves out the same sources for the same reason). Fixed
    by adding `CHANNEL_PAID_SOURCES` (`lib/labels.ts`) and widening the query to
    `paid`/`cash` **or** (a channel source **and** `pending`) — a `pending`
    `walkin`/`phone`/`website` booking still means genuinely unpaid and is still
    excluded. August's reconciliation total moved from ₹127,680 to ₹167,440, and
    Booking.com — previously absent from "Revenue by Source" entirely — now
    shows its ₹33,600 stay.
  - The mislabeling: the two tabs measure legitimately different things —
    Reconciliation is a cash view (money received, booked whole to the
    check-in month); Reports is an earned view (money accrued per night across
    an arbitrary window, same basis as ADR/RevPAR, B-20). Both are useful and
    neither is "the" number, so the fix is relabelling rather than picking a
    winner: Reconciliation now says "Revenue Received" with a note explaining
    what it includes and pointing at Reports for the other view; Reports says
    "Revenue Earned" with the reverse pointer. Neither screen says "Total
    Revenue" unqualified any more.
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
