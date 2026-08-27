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

Nothing open.

Add a row when you find something you are not fixing in the same change — the
table header lives with the [Fixed](#fixed) section below, and the format is
the same: **what input produces what wrong output**. An entry you cannot write
that line for is a code-quality note and belongs in a `/simplify` pass.

---

## Fixed

| ID | Severity | Summary | Fixed in |
|---|---|---|---|
| B-53 | Low | `Package`, `Testimonial`, `BlogPost` and `GalleryImage` were defined in the schema and read by nothing; the site served hardcoded copies, and "Monsoon Magic" was priced two ways | `lib/site-content.ts`, `prisma/seed-content.ts`, migration `10_content_english_only`, packages/blog/gallery pages, `components/sections/Testimonials.tsx`, `components/admin/panels/{Packages,Testimonials}.tsx` |
| B-63 | Low | Guest input was interpolated unescaped into the HTML of all three emails this application sends | `lib/html-email.ts`, `app/api/contact/route.ts`, `app/api/payment/verify/route.ts`, `app/api/admin/communications/route.ts` |
| B-62 | Medium | All 35 invoices on file were issued under the placeholder GSTIN `27XXXXX0000X1ZX` | `lib/hotel-details.ts`, `lib/invoice-service.ts`, `prisma/backfill-invoices.ts`, `prisma/repair-invoice-gstin.ts`, `components/admin/panels/HotelSettings.tsx` |
| B-67 | Medium | No error boundary anywhere: a render error dropped the visitor on Next's own error screen, mid-checkout included | `app/global-error.tsx`, `app/not-found.tsx`, `app/[locale]/error.tsx`, `app/[locale]/not-found.tsx`, `app/[locale]/booking/error.tsx`, `app/admin/(protected)/error.tsx` |
| B-61 | Medium | A contact inquiry was written to the database and read by nothing — with Resend down, a submission reached no one | migration `9_contact_inquiry_handled`, `app/api/admin/inquiries/**`, `components/admin/panels/Inquiries.tsx`, `/admin/guests` hub, `components/admin/AdminSidebar.tsx` |
| B-66 | Medium | No sitemap, no robots.txt, no structured data and no `metadataBase` — every shared link previewed as the site default and room pages relied on being crawled | `lib/site-url.ts`, `lib/structured-data.ts`, `app/sitemap.ts`, `app/robots.ts`, `components/seo/JsonLd.tsx`, `app/layout.tsx`, `lib/page-metadata.ts` |
| B-60 | High | Deactivating or demoting a staff member had no effect until their token expired, up to 12 hours later | `lib/admin-auth.ts` (`resolveActiveStaff`), `lib/api-auth.ts`, `lib/admin-page-auth.ts`, the protected layout and 5 hub pages, `app/api/admin/staff/[id]/route.ts` |
| B-64 | Medium | Nothing rate-limited the three unauthenticated endpoints; a script could hold every room in the property for an hour | `lib/rate-limit.ts`, migration `8_rate_limits`, booking-create / login / contact routes, `app/api/cron/expire-holds/route.ts` |
| B-59 | Critical | The seeded `owner` password was `admin123`, printed in four git-tracked files, and nothing in the app could change it | `app/api/admin/auth/password/route.ts`, `lib/passwords.ts`, `prisma/seed-admin.ts`, `components/admin/panels/HotelSettings.tsx`, `scripts/shot.mjs`, `README.md`, `test.md`, both `SKILL.md`s |
| B-65 | Medium | Every control in the Add Staff modal carried the same `id`, so all four labels pointed at the Name input | `components/admin/panels/HotelSettings.tsx` |
| B-58 | Medium | A request for more rooms of a type than are free was silently reduced: a party that selected 3 standard rooms was quoted and booked 2, with rollaways covering the heads | `allocate()` in `lib/room-capacity.ts`, `resolveSelection()` in `lib/booking-service.ts` |
| B-57 | High | A party of 5 was told "No rooms available" on dates when every room stood free — no single room sleeps more than 4, and one booking could hold only one room | `lib/room-capacity.ts`, `createGroupBooking()`, `BookingWizard.tsx`, migrations `6_room_extra_bed_rate` + `7_booking_groups` |
| B-51 | High | 6 stays sat `checked_in` up to 91 days past departure, holding their rooms and with no tax invoice | `prisma/close-overdue-checkouts.ts`, `backfill-invoices.ts`, `repair-data.ts` (all run 2026-08-25) |
| B-55 | Medium | `/rooms` advertised every amenity in a category, so a forest view on 1 of 4 standard rooms was sold to all of them | `lib/room-catalogue.ts`, `getAvailableRooms()`, `app/[locale]/rooms/[slug]/page.tsx` |
| B-56 | Low | A non-numeric `DATABASE_POOL_MAX` silently reverted the pool to 10, undoing the fix for booking-contention `P2028` | `lib/prisma.ts` |
| B-52 | Medium | 11 of 13 public pages shared one `<title>` and one meta description | `lib/page-metadata.ts`, `messages/en.json`, 12 pages and 2 new layouts |
| B-54 | Low | `seed-demo.ts` created instead of upserting, so each run duplicated every package and testimonial | `prisma/seed-demo.ts` |
| B-49 | Medium | Every control in the guest booking wizard was unlabelled — 8 bare `<label>`s, no `htmlFor`, no ids | `components/booking/BookingWizard.tsx`, `messages/en.json`, `__tests__/unit/components/field-labels.test.tsx` |
| B-50 | Medium | Past-guest campaigns deduped by email even for WhatsApp, dropping every emailless guest but one | `app/api/admin/communications/route.ts` |
| B-48 | High | The nightly cron flagged rooms "Due Check-in" and nothing could ever clear them | `runNightAudit()` in `lib/booking-service.ts`, `prisma/repair-data.ts` |
| B-42 | Low | The room list offered stays for past dates that the single-room check and `createBooking` both refused | `getAvailableRooms()` in `lib/booking-service.ts` |
| B-43 | Low | `previewPromo` trimmed the code and `claimPromo` did not, so a previewed discount could fail the whole booking | `lib/booking-service.ts` |
| B-44 | Low | Cancel accepted an unbounded `refundAmount` — the twin of B-26 | `app/api/admin/bookings/[id]/cancel/route.ts` |
| B-45 | Low | `dateOnly("2026-02-30")` silently returned 2 March instead of throwing | `lib/dates.ts`, 15 routes now validating with `isDayString` |
| B-46 | Low | `npm run lint` had not run since `eslint-config-next` 16 — it died on its own config | `package.json`, `app/[locale]/about/page.tsx`, `components/sections/Testimonials.tsx`, `components/admin/panels/NightAudit.tsx` |
| B-47 | High | The Communications panel crashed on the render right after a successful bulk send | `components/admin/panels/Communications.tsx` |
| B-39 | Medium | Any failed admin fetch left the panel on "Loading…" forever, with no error and no retry | `lib/api-client.ts`, `components/ui/ErrorState.tsx`, 24 panels and pages |
| B-40 | Medium | A 401 carried no `error` string, so an expired session made "Email Invoice" do nothing at all | `lib/api-auth.ts`, `app/admin/(protected)/invoices/[id]/print/page.tsx` |
| B-41 | Medium | Malformed query params returned an empty 500 instead of a 400 | `lib/query-params.ts`, `lib/dates.ts`, reconciliation/expenses/laundry/guests/bookings/availability routes |
| B-38 | Critical | A guest paying after their hold expired was charged for a cancelled booking and emailed "Booking Confirmed!" | `app/api/payment/verify/route.ts` |
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

- **B-42.** `checkAvailability` refuses a stay in the past and so does
  `createBooking`, but `getAvailableRooms` — the query behind the room list —
  had no such guard, so /rooms advertised rooms for dates nobody could book and
  the single-room check on those same dates said the opposite. It now applies
  the same two guards and returns `[]` without a round trip.

- **B-43.** The preview route trimmed the code before matching and `claimPromo`
  did not, so a pasted or autocompleted `" SUMMER20 "` previewed as a valid
  discount and then failed to claim — and a promo that cannot be claimed fails
  the *whole* booking rather than falling back to full price, so the guest was
  refused with "that promo code is no longer valid" against a code they had
  just watched work. Both functions trim now, so they cannot disagree about
  which string they are matching. `releasePromoClaimByCode` trims too, or a
  code claimed as `SUMMER20` would not be found when handed back under the
  untrimmed form and the redemption would leak; the booking stores the trimmed
  code for the same reason.

- **B-44.** Twin of B-26. `z.number().min(0)` with no ceiling meant a mistyped
  refund — an extra zero, transposed digits — was stored as-is and shown on the
  booking page as fact. Capped against the booking total, and the cancellation
  is refused outright rather than going through with a bad figure attached.

- **B-45.** A day that does not exist does not come back as `Invalid Date`, it
  rolls over: `new Date("2026-02-30T00:00:00.000Z")` is 2 March, so blocking
  "30 Feb" silently blocked a day in March. `dateOnly` round-trips the parse
  now and throws `No such date`.

  That fix could not land on its own. `dateOnly` throwing is precisely what
  turns into an empty 500, and ~20 callers validated with a bare
  `/^\d{4}-\d{2}-\d{2}$/` that happily accepts `2026-02-30` — so making it
  strict without touching them would have re-created the B-41 class it was
  meant to close. `isDayString` in `lib/dates.ts` is the same check without the
  throw, and all 24 validation sites across 15 routes now use it (via
  `z.string().refine(isDayString, …)`), so an impossible date is a 400 with a
  message. Verified end to end: blocked-dates, promos, calendar, quote, shifts
  and reports all answer 400 for `2026-02-30`, none of them 500.

- **B-46.** `eslint-config-next` had drifted to 16 while the project runs Next
  14, and eslint 8 cannot load its flat config — `next lint` died on
  "Converting circular structure to JSON", so nothing had been linted for some
  time. Pinned back to `^14` to match the framework. It runs clean now, but
  only after fixing the 8 `react/no-unescaped-entities` errors it had not been
  around to report.

- **B-51.** The departure half of B-04. That bug was "the cron night audit only
  ever looked at yesterday, so a skipped run was permanent", and arrivals were
  changed to an open-ended `checkIn: { lt: today }`. Departures never were:
  `checkOut: today` in `runNightAudit` and `{ gte: today, lt: tomorrow }` in
  `/api/admin/night-audit/run` and `/summary` all matched the checkout day
  exactly, so a guest who left without the desk pressing "Check out" dropped
  off the due-departures list at midnight and stayed `checked_in` for good.

  Two consequences. The room board held those rooms indefinitely — #104 read
  "Due Check-in" because a guest who left on 2 August was still, as far as the
  system knew, in it. And `generateInvoice` is only ever called from check-out,
  so all six were completed, paid stays with no GST invoice that
  `backfill-invoices.ts` could not reach, because it selects
  `status: "checked_out"`. `repair-data.ts` could not reach them either: its
  `ENDED` list is `cancelled`/`no_show`/`checked_out`, and a stuck `checked_in`
  is none of those.

  Fixed in two parts. **Surfacing:** departures now match
  `checkOut: { lte: today }` in all three places, and `overdueCheckouts` is
  returned separately from `dueCheckouts` so a backlog cannot hide inside
  today's number. The audit still closes nothing on its own — an overdue
  checkout is a real stay that ended, but the guest may equally still be in the
  room, and checking out issues a tax invoice, which is not an act to automate
  on a guess.

  **The backlog**, six stays totalling ₹153,380, was closed on 2026-08-25 by
  the three scripts in order. Clearing it through the admin panel would have
  been wrong: the check-out route stamps `actualCheckout: new Date()` and
  `generateInvoice` dates both the invoice number and `invoiceDate` from
  `today()`, so pushing a stay that ended on 26 May through the UI issues a tax
  invoice dated August for a May supply — and `generateInvoice` is idempotent,
  so it could not be reissued with the right date afterwards.

  ```
  1. close-overdue-checkouts.ts --apply   6 closed, actualCheckout backdated
  2. backfill-invoices.ts --apply         INV-20260526-001/002, -20260527-001,
                                          -20260731-001, -20260802-001/002
  3. repair-data.ts --apply               6 rooms freed (#102-#105, #203, #204)
  ```

  Step 3 is separate on purpose: `repairStaleCheckinFlags` skips any room with
  a guest checked into it, so it could only see these once step 1 had closed
  them. It had reported 5 stale rooms before and 6 after — the extra is #104,
  which B-48's note called out as drift of a different kind.

  The three May bookings carry no `cgstAmount`/`sgstAmount`, so their invoices
  show ₹0 GST. That matches the five pre-June invoices the B-28 backfill
  already issued — the figure comes off the booking row, and these predate GST
  being recorded on one at all.

- **B-55.** `getRoomCategories` merges the rooms of a type into one card, and
  merged price honestly — the category **minimum**, "so the headline figure is
  one a guest can actually get" — while merging amenities as a **union**, which
  breaks the same principle one line above. "Forest View" is on one of four
  standard rooms, so `/rooms` sold a view to three guests in four who would not
  get one. The guest never picks a door number: the wizard shows one card per
  type and allocates a specific room, which was `standard-room-102` — no view.

  `amenities` is now the **intersection**, so a card only promises what every
  room of the type has. The odd ones out are not dropped, because the property
  really does have a forest-view room: they come back as `someRoomsAmenities`
  and the *detail* page lists them apart, under "Available in selected rooms of
  this type". Cards show guaranteed amenities only.

  The second half was latent and is closed too. `getAvailableRooms` had no
  `orderBy`, so which room represented a type — and therefore its price in the
  wizard — was whatever Postgres returned first. It now orders by
  `pricePerNight asc, roomNumber asc`, the same order `getRoomCategories` uses
  to pick the advertised price, so `/rooms` and the wizard cannot quote
  different numbers for one type. Prices are uniform within every type today,
  which is the only reason this had not already become B-02 again.

- **B-56.** `lib/prisma.ts` read the pool size as
  `Number(process.env.DATABASE_POOL_MAX ?? 20)`. `Number("abc")` is NaN, and
  pg-pool assigns `max = max || … || 10` — NaN is falsy, so it landed on 10,
  verified against the installed package:

  ```
  DATABASE_POOL_MAX=20    -> pool max = 20
  DATABASE_POOL_MAX=abc   -> pool max = 10
  ```

  Ten is exactly the starving default the comment on that line exists to move
  away from, so a typo in one env var silently undid a documented concurrency
  fix and surfaced to guests as "Something went wrong" when two booked the same
  room at once. It uses `positiveIntParam` now, which cannot return NaN, with a
  ceiling of 100 to catch the same typo in the other direction.

- **B-52.** `app/layout.tsx` had always defined the template — `%s | Rio Casa
  Mahabaleshwar` with a default — and almost nothing supplied the `%s`. Only
  `/privacy` and `/blog/[slug]` exported metadata, so eleven pages returned the
  identical title *and* description: a guest with two tabs open could not tell
  them apart, and the pages competed with each other in search for one snippet.

  Copy now lives in a `meta` namespace in `messages/en.json` and is read
  through `getTranslations`, which is what CLAUDE.md specifies for metadata —
  so page titles are subject to the same "no hardcoded UI text" rule as
  everything else. `lib/page-metadata.ts` reduces a page to one line:
  `export const generateMetadata = () => pageMetadata("about");`

  Three things were not uniform and are worth knowing before adding a page:

  - **`/contact` and `/gallery` are client components**, and only a server
    component can export metadata. Each gained a sibling `layout.tsx` that
    carries it.
  - **`/rooms/[slug]` is titled from live inventory** via `getRoomCategory`,
    the same call the page itself uses, so a room type the property does not
    have gets "Room not found" rather than the site default.
  - **The home page deliberately sets nothing.** Next applies `title.default`
    verbatim and the template only to child titles, so `/` correctly renders
    "Rio Casa — Luxury Resort in Mahabaleshwar" with no suffix.

  The template also means **a page title must not contain the brand**. Both
  pages that already had metadata did: `/blog/[slug]` returned
  `${post.title} — Rio Casa`, which rendered as "… — Rio Casa | Rio Casa
  Mahabaleshwar". Both are fixed, and a test fails on any title containing
  "Rio Casa" outside the root layout.

- **B-54.** `prisma/seed-demo.ts` called `create` rather than upserting, so
  every run added a fresh set — four runs left four copies of each package and
  24 testimonials where six were intended. The package call was written
  `create({ data: p }).catch(() => {})`, apparently to make re-runs safe; with
  no unique constraint on `nameEn` the insert *succeeded* and duplicated, and
  the `catch` only hid genuine errors.

  Both seeds now match on a natural key (`nameEn`, `guestName`) and update
  rather than insert. `upsert` was not available: it needs a unique
  constraint, and a unique index cannot be added to `packages` while the
  duplicates are still there — the fix would have had to run before its own
  migration could.

  Cleaning up the existing duplicates is opt-in behind `--prune`, because
  deleting rows is not something a seed should do by default and the script no
  longer creates any. Without the flag it reports what it found. The duplicates
  are inert either way, since nothing reads those tables (B-53).

- **B-49.** `components/ui/Field.tsx` exists so a label cannot be written
  without its `htmlFor`, and `field-labels.test.tsx` fails the build if a bare
  one reappears — but it grepped `components/admin app/admin` only, so the
  wizard was never in scope. Every control on every step came back unlabelled
  when audited in a browser: both dates, name, email, phone, special requests
  and the promo code. The public contact form was already correct, which is
  what made this the one form on the site that had been missed — and the one
  every booking goes through.

  All seven inputs go through `Field` now, with the wizard's own label
  typography passed as `labelClassName` so nothing changed visually. "Number of
  Guests" was a `<label>` over a pair of buttons, which names nothing at all;
  it is a `<span id>` with `role="group"` and `aria-labelledby` on the
  container, and the `−`/`+` buttons — bare punctuation to a screen reader —
  now carry their own `aria-label`.

  The guard was widened from the two admin directories to `components app`, so
  a guest-facing form cannot slip past it again. Two things came out of doing
  that. It flagged its own documentation, because a comment explaining why the
  counter uses `role="group"` mentions the tag — it now tracks block-comment
  state, since prose about labels is not a label, and a guard that makes people
  reword their comments is a guard people work around. And the strings the
  promo block had hardcoded (`"Promo Code"`, `"Enter code"`, `"Apply"`,
  `"Checking…"`, `"Code applied."`) had to move to `messages/en.json` to be
  passed through `Field` at all, which closes a Strict Rule 1 violation as a
  side effect.

- **B-50.** `distinct: ["guestEmail"]` in the past-guests query is right for an
  email campaign — two stays by one guest should not mean two emails — but the
  channel filter ran *afterwards*, so a WhatsApp campaign had already been
  deduplicated on a column it never messages anyone by. The walk-in form takes
  an email marked "optional" and stores `""`, so every guest without one shared
  a single key and all but one were dropped before their phone numbers were
  looked at. Nothing reported the loss: `skippedCount` is computed after the
  rows are already gone.

  Deduplication moved out of SQL into `dedupeByChannel`, which keys on the
  identifier that channel actually reaches someone by — email for email, phone
  for WhatsApp — and is applied inside `resolveRecipients` so the counts staff
  see keep meaning "unique people". Addresses are compared case-insensitively.
  A recipient with no usable identifier is kept rather than collapsed, so it is
  counted as skipped instead of silently merging with whichever other
  contactless guest happened to sort first.

- **B-48.** Two implementations of one operation, one fixed and the other not —
  and the one that ran nightly in production was the broken one.
  `runNightAudit()` flagged today's arrivals with `occupancy: "due_checkin"`
  but never wrote `currentBookingId`, while every path that frees a room keys
  on exactly that column: `releaseRoomsHolding` matches
  `currentBookingId: { in: … }`, the cancel route matches
  `currentBookingId: booking.id`, and `repair-data.ts` looked for the same
  drift. None of them can match a NULL, so a guest who no-showed, cancelled or
  moved their dates left the room reading "Due Check-in" for good and the flags
  accumulated. `/api/admin/night-audit/run` had written `currentBookingId` all
  along — its comment even records this exact failure being fixed there, "rooms
  201/202 sat that way for two months" — but the scheduled path never got the
  same change.

  Fixed on both counts. The upsert now writes `currentBookingId` /
  `currentGuestId`, which is what makes the flag clearable at all; and the
  audit clears stale `due_checkin` rows before re-flagging, so the state is
  derived from today's bookings rather than added to — the same lesson as
  `guest.totalStays` and `roomStatus.currentBookingId` in CLAUDE.md. Clearing
  is scoped to rooms the audit owns: `occupied` and `out_of_order` are left
  alone, and a room with a guest still checked into it is never reset, because
  a stale flag is better than a board that hides someone who is in the room.

  `repair-data.ts` gained a third repair for the rows already broken — the
  existing one starts from `currentBookingId: { not: null }` and so could not
  see them. It reported 5 stale rooms on the live database where it previously
  reported none. (It spared #104 at the time, which was drift of a different
  kind — a stay stuck `checked_in`; see B-51, whose backlog has since been
  closed, freeing that room too.)

- **B-47.** Found while typing the `apiJson` conversion — TypeScript caught what
  `res.json()`'s `any` had been hiding. `/api/admin/communications` answers
  `ok({ sentCount, skippedCount, errors, … })`, so the payload is under `data`,
  but the panel did `setSendResult(data)` and stored the whole envelope. Every
  field it then rendered was `undefined`, and `sendResult.errors.length` threw
  `Cannot read properties of undefined` — so the panel blanked on the render
  immediately after a successful send, with the messages already delivered and
  no way to see how many. Exactly the drift `lib/api-response.ts` warns about,
  just from the client side: `data.data` is the payload, always.

- **B-39.** The same failure B-14 fixed for `WalkInModal`, left everywhere else:
  `setLoading(true)` → `await fetch` → `await res.json()` → `setLoading(false)`,
  with no `try`/`catch`. `fetch` rejects when the network drops and `res.json()`
  throws on an empty body (B-41), and either way the `setLoading(false)` below
  never ran. Fixed with `apiJson` in `lib/api-client.ts` — the browser-side
  companion to `lib/api-response.ts`, which does the fetch and the parse in one
  call that cannot throw and always yields a string `error`. It replaced 59
  hand-written call sites across 24 files.

  A panel that merely stopped hanging would still have been wrong: it fell
  through to its *empty* state, and "No promo codes yet" claims the property has
  none when in truth we never managed to ask. Loaders now keep a `loadError` and
  render the shared `ErrorState` (message + "Try again") instead.

- **B-40.** `requireRole` hand-wrote `{ success: false }` with no `error`,
  breaking the one rule `lib/api-response.ts` exists to hold. The invoice print
  page does `setEmailMsg(data.success ? data.message : data.error)`, so an
  expired session set the message to `undefined` and the click appeared to do
  nothing at all. It returns `fail("Your session has expired — please sign in
  again.", 401)` now, and `apiJson` fills a message in for any response that
  still carries none.

- **B-41.** Two shapes, both ending in a zero-byte 500 that the panels could not
  parse — which is what triggered B-39 in practice. `/^\d{4}-\d{2}$/` accepts
  "2026-99", which then threw inside `dateOnly`; `MONTH_PATTERN` /
  `isMonthString` in `lib/dates.ts` constrain the month to 01–12, and
  reconciliation, expenses and laundry all use it (calendar already did — that
  is where the correct version was). And `Math.max(1, parseInt("abc"))` is NaN,
  not 1, which reached Prisma as `skip: NaN`; `positiveIntParam` in
  `lib/query-params.ts` never returns NaN, used by the guests, bookings and
  public availability routes.

- **B-38.** `/api/payment/verify` selected `paymentStatus` but never `status`,
  so it could not tell a live booking from one `expireStalePaymentHolds()` had
  already cancelled. A guest who left the Razorpay modal open past
  `BOOKING_HOLD_MINUTES` and then paid was charged for a stay whose room was
  back on the calendar, emailed "Booking Confirmed!", and shown "This booking
  did not go through" by the confirmation page — which had been handling this
  case correctly all along. The sweeper's Razorpay check does not close it: it
  rules out a booking that was *already* paid, not one paid a moment later.

  The route now selects `status` and, for a `cancelled`/`no_show` booking,
  tries to give the room back before doing anything else. Reinstatement goes
  through `guardRoomAvailability` like every other path that writes a booking,
  so it takes the same `FOR UPDATE` and the same conflict/blocked-date
  re-check, and it flips the row to `confirmed`/`paid` inside that transaction
  so the `no_overlapping_bookings` exclusion constraint backstops it at commit.
  That is the common case — a hold expiring does not mean anyone else took the
  room in the seconds since.

  When the room really has gone (or the stay has already started, which is the
  no-show case), nothing is confirmed and no email is sent: the payment is
  written to `payments` as `completed` with a note saying to refund or rebook,
  `razorpayPaymentId` is stamped on the booking so a replay cannot write a
  second row, and an audit row goes in with `needsRefund: true`. The booking
  stays `cancelled`, so the money never reaches a revenue report — this is a
  refund waiting to happen, not income. The wizard already shows "do not pay
  again" on any non-2xx, so the guest is told the truth either way.

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

**B-58.** `allocate` clamped each line to what was free, and nothing downstream
could see that it had:

```ts
.map((c) => ({ cat: c, rooms: Math.min(selection[c.roomType], c.count) }));
```

`resolveSelection` read as though it caught the overshoot —
`if (ofType.length < line.rooms) return null; // asked for more than exist` —
but `line.rooms` was already clamped to `cat.count`, and `cat.count` counted the
very list `ofType` was filtered from. The guard could not fire.

**The failure.** Two standard rooms free, party of six, `rooms=standard:3`:
`/api/booking/quote` returned **200** with `totalRooms: 2, extraBeds: 2`, and
`/api/booking/create` committed two bookings and charged for two rooms plus two
rollaways. The party sleeps, so no check anywhere had anything to complain
about — they booked three keys and would have arrived to two. A second form of
the same fault was worse: `{ standard: 1, deluxe: 1 }` with no deluxe free
dropped the deluxe line from `lines` entirely, so two couples wanting separate
rooms were booked into one.

Reachable from the wizard without a hand-made request. Availability is fetched
once, on "Continue to Room Selection", so a guest who selects three standards
while three are free and continues after someone else takes one sends
`standard:3` against two; `setRoomCount` clamps to the counts the browser last
saw, which is exactly the stale number.

**The fix.** Clamping stays — it is the only honest allocation — but the
`Allocation` now reports what it could not fill: `shortRooms` across the whole
selection, and `requested` alongside `rooms` per line. Counting over the
selection rather than over the resulting lines is what catches the sold-out
type, which has no line to inspect. `resolveSelection` refuses on
`shortRooms > 0`, so both forms now answer 409 "Those rooms are no longer
available" — the same answer the endpoint already gave when a type had nothing
free. The unreachable guard is gone.

The guest is not stranded: the wizard clears the total and shows "We could not
calculate the price for these dates. Please go back and try again.", and
checkout stays disabled without a quote. Going back and continuing refetches
availability and resets the selection.

Covered by `__tests__/unit/lib/resolve-selection.test.ts` (new — the function
had none) and four cases in `room-capacity.test.ts`, including one asserting
`suggestAllocation` never proposes a plan the new guard would reject.

**B-57.** Two independent gaps, both reachable from the same guest counter.

**Capacity ignored the extra bed.** Every room carries `extraBed: true`, but
availability filtered on `maxGuests` alone, so the family room (sleeps 4) was
never offered to a party of 5. `getAvailableRooms` now matches
`maxGuests >= n OR (extraBed AND maxGuests >= n - 1)`.

**And the bed was free.** `quoteStay` read `extraBedRate` only from a rate plan;
no rate plan exists in this database, so every rollaway was billed at ₹0. The
tariff now lives on the room (`rooms.extra_bed_rate`, backfilled to ₹1,000) and
a rate plan may override it only by naming a non-zero figure — treating a plan's
default 0 as "free" would have re-opened the same hole the first time a manager
created one. The Fri/Sat markup lifts the room rate only; a rollaway is a flat
add-on.

**One booking could hold only one room.** `Booking.roomId` is a single FK, so a
party needing two rooms could not be expressed at all. `booking_groups` now owns
what rooms share — the Razorpay order, the promo claim, the number the guest
quotes — while each room stays its own `bookings` row, leaving the exclusion
constraint, the night audit, housekeeping and every report untouched. Every
website booking gets a group, a single-room stay included; `createBooking` is a
one-room adapter over `createGroupBooking`, so there is no second path to drift.

Three things that needed care and are worth not undoing:
- **Lock order.** `guardRoomsAvailability` takes every room in one
  `ORDER BY id ... FOR UPDATE`. Two parties overlapping on rooms deadlock if
  each locks in the order its guest happened to pick.
- **GST stays per room.** The slab follows each room's nightly rate, so a family
  in three ₹4,500 rooms stays at 12% rather than being pushed to 18% by a
  ₹13,500 sum. The promo discount is split across rooms in proportion, with the
  rounding remainder on the last, so the parts sum to what Razorpay was charged.
- **A party expires and reinstates whole.** `expireStalePaymentHolds` widens each
  candidate to its group and rolls back on a short count; `/api/payment/verify`
  settles every room on the one order. Releasing two rooms of three leaves a
  family holding a booking they cannot sleep in.

Extra beds are never a guest toggle — the server derives them from the headcount
in `resolveSelection`, for the same reason no total is computed in the browser.


---

**B-59 — rotate the seeded accounts.** The fix removes the passwords from the
working tree and gives every rank a way to change their own, but it cannot
remove them from **git history**: anyone with a clone can still read
`admin123` at any commit before this one. The code change is therefore only
half the remedy. The other half is operational and has to be done once,
against the live database:

1. Sign in as each seeded account and change its password from
   **Setup → Hotel & Staff → Change Password**, or
2. drop the seeded rows and re-run `npm run seed:admin`, which now prints a
   random password per account.

Until that is done the published passwords are still live. `npm run seed:admin`
no longer overwrites an existing account, so re-running it is not a shortcut —
it will report the accounts as unchanged.

---

**B-64 — the migration has to be applied.** `8_rate_limits` creates the table
the limiter counts in. Until `npx prisma migrate deploy` has run against the
environment, `checkRateLimit` finds no such relation, logs it, and **fails
open** — every request is allowed, exactly as before the fix. That is
deliberate (a limiter must not 500 a booking because its own counter is
unreachable), but it does mean a deploy of the code without the migration is a
deploy with no rate limiting and only a log line to say so.

Check with `npx prisma migrate status`, and grep the logs for
`[rate-limit] Counter unavailable` after deploying.

---

**B-62 — the 35 existing invoices still need correcting.** The code no longer
issues one under the placeholder, but `hotelGstin` is *snapshotted* onto the
`Invoice` row at check-out — deliberately, so a tax document handed to a guest
cannot change when someone edits a setting later. Fixing the code therefore
does nothing for rows already written, and every invoice on file carries
`27XXXXX0000X1ZX`.

```bash
HOTEL_GSTIN=<the property's real GSTIN>          # set it in the environment first
npx tsx prisma/repair-invoice-gstin.ts           # dry run — lists what would change
npx tsx prisma/repair-invoice-gstin.ts --apply   # rewrite them
```

The script refuses to run while `HOTEL_GSTIN` is unset, the placeholder, or
malformed — there would be nothing to correct the rows *to*. It touches only
rows carrying the placeholder, so an invoice bearing a real (or older) GSTIN is
left exactly as it is.

**It cannot un-send anything.** An invoice already emailed or printed is out in
the world with the wrong number on it; correcting the record is the part that
can be automated, and reissuing to affected guests is the property's call.

---

**B-53 — what moved, and one thing that did not.** All four models are read by
the site now, through `lib/site-content.ts`, and seeded from
`prisma/seed-content.ts`. The live content was preserved exactly: the same four
packages at the same four prices, the same three testimonials, the same four
posts and the same 23 photographs.

Two deliberate changes came with it:

- **Monsoon Magic has a real validity window** (1 Jul – 30 Sep) rather than a
  hardcoded "Jul–Sep only" badge, so it now leaves the page by itself. That is
  what `validFrom`/`validTo` were always for.
- **The demo rows were retired, not deleted.** `seed-demo.ts` had left two
  packages and nine testimonials in the database, all of them invented and all
  pre-approved. Now that the site reads these tables, leaving them approved
  would publish fabricated guest reviews as real ones — so `--exclusive` set
  them `isActive: false` / `isApproved: false`. They are still there, and
  Setup → Testimonials can publish any of them.

**The packages page lost its "2 nights / 3 days" line.** `Package` has no
duration column and inventing one for a value already stated in every
package's inclusions ("Deluxe Garden View Room (2 nights)") was the worse
trade. Add a column if the standalone line is wanted back.
