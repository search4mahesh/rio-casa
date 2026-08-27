# Rio Casa Resort Website — CLAUDE.md

## Project Overview
Full-featured resort website for **Rio Casa**, Mahabaleshwar, Maharashtra.
Goals: direct bookings, brand presence, event/package promotion.

## Known bugs — `BUGS.md`
Defects live in `BUGS.md`, with stable ids (`B-04`) you can cite in commit
messages. Both tables are worth reading: Open is what is still wrong, and Fixed
records what each bug actually did. **Read it before starting on anything
money-, date- or promo-shaped**, so you can tell a deliberate decision from a
regression you are about to reintroduce.

Maintain it as you go: log what you find but do not fix, move entries to the
Fixed table when you do, and delete ones that turn out to be wrong. Every entry
names a concrete failure — input, wrong output. Code-quality observations with
no failure attached belong in a `/simplify` pass, not there.

## Tech Stack
- **Next.js 14** — App Router, TypeScript, `app/` directory
- **Tailwind CSS v3** — design tokens in `tailwind.config.js`
- **next-intl** — string store only. **English (`en`) is the only locale.**
- **Prisma 7 + PostgreSQL** (Neon) — bookings, rooms, packages, blog, testimonials
- **Razorpay** — payments (cards, UPI, net banking)
- **Resend** — transactional booking confirmation emails
- **Framer Motion** — page/section animations
- **React Hook Form + Zod** — all form validation

## Directory Structure
```
app/                  Next.js App Router pages
  layout.tsx          Root layout with metadata
  page.tsx            Home page
  globals.css         Tailwind + Google Fonts import
  api/                API routes only (no UI)
    booking/          POST create-booking, GET availability
    payment/          POST verify Razorpay signature
    contact/          POST contact form
components/
  layout/             Navbar, Footer, WhatsAppButton
  sections/           Hero, RoomGrid, PackageCards, Testimonials, etc.
  booking/            BookingWizard, DatePicker, RoomSelector, PaymentStep
  ui/                 Shared primitives (Button, Card, Input, Badge)
lib/
  prisma.ts           Prisma client singleton
  razorpay.ts         Razorpay SDK wrapper
  i18n.ts             (handled by next-intl root i18n.ts)
messages/
  en.json             All UI strings — NEVER hardcode text
prisma/
  schema.prisma       DB schema (Room, Booking, Package, Testimonial, BlogPost)
```

## Strict Rules
1. **No hardcoded UI text** — every visible string must use `useTranslations()` from next-intl
2. **Tailwind only** — no inline styles, no CSS modules (except globals.css for @layer)
3. **Server Components by default** — only add `"use client"` when you need interactivity or hooks
4. **Zod schemas** — validate all API request bodies at the route handler level
5. **Prisma via singleton** — app code always imports `prisma` from `@/lib/prisma`.
   Standalone scripts in `prisma/` use `makeScriptClient()` from
   `prisma/script-client.ts`. Never construct `new PrismaClient()` directly —
   under Prisma 7 it does not even compile without a driver adapter.

## Design Tokens (Tailwind)
```
primary          #4A6741  (forest green)
accent           #8B6914  (golden brown)
earth-bg         #F5F0E8  (warm cream background)
earth-text       #2C2416  (dark earth text)
earth-white      #FDFAF5  (off-white)
font-serif       Cormorant Garamond
font-sans        DM Sans
font-deva        Noto Sans Devanagari (Hindi/Marathi)
```

## Component Classes (globals.css)
```
.btn-primary          Green filled button (public site)
.btn-outline          Green outline button (public site)
.btn-admin            Admin action button — appearance only; keep your own
                      layout utilities (flex-1, w-full, px-4 py-2) alongside it
.section-heading      Serif h2/h3 style
.section-subheading   Italic serif subtitle
.container-resort     max-w-7xl centered with padding
```
Use the design tokens above, never raw hex (`bg-primary`, not `bg-[#4A6741]`).
Exceptions are third-party brand colours (WhatsApp green, Razorpay theme).

## Shared UI (`components/ui/`)
- `Toast` + `useToast` — transient admin confirmations. One implementation;
  don't hand-roll toast state, timers, or markup in a panel.
- `Field` — a labelled form control. **Never write a bare `<label>` beside an
  input.** A label with no `htmlFor` names nothing: a screen reader announces an
  unlabelled box, and clicking the label does not focus the control. `Field`
  hands its child the id via a render prop, so the association cannot be
  forgotten:

  ```tsx
  <Field label="Phone *">{(id) => <input id={id} value={phone} onChange={…} />}</Field>
  ```

  Ids come from `useId()`, not the label text, so a form rendered twice on one
  page cannot collide. For a *group* of controls — radio sets, rows of buttons —
  a `<label>` is wrong entirely; use a `<span id>` plus
  `role="radiogroup"`/`"group"` and `aria-labelledby` on the container.
  `__tests__/unit/components/field-labels.test.tsx` fails the build if a bare
  label reappears anywhere under `components/admin` or `app/admin`.

## Talking to the API from the browser (`lib/api-client.ts`)

**Never call `fetch` + `res.json()` directly in a panel.** Use `apiJson`, the
browser-side companion to `lib/api-response.ts`:

```ts
const data = await apiJson<Promo[]>("/api/admin/promos");
if (data.success) setPromos(data.data);
else setLoadError(data.error);
setLoading(false);              // always reached
```

It does the fetch and the parse in one call that **cannot throw**, and returns
the same `{ success, data, error }` envelope the route sent. Two things it
guarantees that hand-written pairs did not:

- **`setLoading(false)` always runs.** `fetch` rejects when the network drops,
  and `res.json()` throws on an empty body — which is what an unhandled route
  error returns. Either one used to skip the line below it and leave the panel
  on "Loading…" until the page was reloaded (B-39).
- **`error` is always a non-empty string**, even when the response carried
  none, so `showToast(data.error)` cannot render `undefined`.

Read the payload as `data.data` — `ok(payload)` nests it, and storing the whole
envelope is how the Communications panel came to crash on `sendResult.errors`
(B-47).

A load that fails must not fall through to the panel's *empty* state: "No promo
codes yet" says the property has none, when in truth we never managed to ask.
Keep a `loadError` and render `ErrorState` from `components/ui/ErrorState.tsx`,
which shows the message and a "Try again" that re-runs the loader.

## Query params in route handlers

Bodies are validated with Zod. Query params need the same care, because
`parseInt` returns NaN and NaN then propagates silently — `Math.max(1,
parseInt("abc"))` is NaN, not 1, and `skip: NaN` reaches Prisma and kills the
request with an empty 500 (B-41).

- `positiveIntParam(raw, fallback?, max?)` from `lib/query-params.ts` for
  counts, pages and page sizes. Never returns NaN.
- `isMonthString(s)` / `MONTH_PATTERN` from `lib/dates.ts` for `YYYY-MM`. A
  bare `/^\d{4}-\d{2}$/` accepts `2026-99`, which then throws inside
  `dateOnly`.
- `isDayString(s)` from `lib/dates.ts` for `YYYY-MM-DD`, in **bodies too**:
  `z.string().refine(isDayString, "Use YYYY-MM-DD")`, never
  `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)`. The regex accepts `2026-02-30`,
  which `dateOnly` rejects — so validating with it and then parsing gives an
  empty 500 where a 400 belongs (B-45).

`dateOnly` throws on a date that does not exist rather than rolling it over
into the next month. Anything downstream of user input either validates first
with the helpers above, or wraps the parse in `try`/`catch`.

## `/rooms` is date-aware
The catalogue takes `?checkIn=&checkOut=` and, when it has them, shows what is
actually free: a count per card, or "Not available for these dates" plus the
next date that works. The dates ride through to the wizard on the Book link, so
the guest is not asked for them twice. Four things this depends on:

- **The counts come from `getAvailableRooms`**, not a query of the page's own.
  The catalogue and the wizard must not be able to disagree about what is free.
- **A booked-out card stays on the page.** It describes a room the property
  owns; dropping it tells a visitor there is no family room at all. What changes
  is the claim it makes and the action it offers — "See 2 Sept" instead of
  "Book This Room".
- **Without dates it makes no availability claim.** "Available" is meaningless
  until there is a stay to measure against, so the page says so rather than
  implying everything is free.
- **`nextAvailableByType(nights, from)`** finds the first day the *whole* stay
  fits, in one bookings query and an in-memory scan. A query per candidate day
  would be 240 round trips to render one page.

The form is a plain `<form method="get">`, so the page stays a server component
and the result is shareable. That is also why the date inputs use explicit
`htmlFor` ids rather than `components/ui/Field` — `Field` passes the id through
a render prop, and a function cannot cross the server/client boundary.

Dates arriving from a query string are validated with `isDayString` before use,
in both pages and the wizard: `?checkIn=2026-02-30` parses as a `Date` but
blanks a date input and makes `differenceInCalendarDays` return NaN, which
disables Continue with nothing on screen to explain why.

## Room categories (`lib/room-catalogue.ts`)
The public site groups rooms by `roomType` — guests choose a kind of room, not
a door number — while the wizard allocates an individual room. Both read
`getRoomCategories()`, so a category cannot be advertised that does not exist
or priced differently from checkout.

**A category may only promise what every room in it has.** Price takes the
category minimum and amenities take the *intersection*, for the same reason:
the guest cannot choose which room they get. Amenities only some rooms have
come back as `someRoomsAmenities` and belong on the detail page, labelled — not
on a card. Advertising the union is how a forest view on one of four standard
rooms was sold to all four (B-55).

`getAvailableRooms` is ordered `pricePerNight asc, roomNumber asc` because the
wizard keeps the first room of each type. Without an explicit order the room a
guest is offered, and its price, is whatever Postgres returns first.

## Shared Data (`lib/labels.ts`)
`ROLE_LABEL`, `ROOM_TYPE_LABEL`, `ROOM_TYPE_FILTER_LABEL` — display names for
domain enums. Import them; defining a local copy in a panel is how
`ROOM_TYPE_LABEL` previously drifted into two incompatible versions.

## API Conventions
- All API routes live in `app/api/**`
- Validate body with Zod before any DB call
- Razorpay webhook: verify `x-razorpay-signature` header before updating booking status

### Auth — `lib/api-auth.ts`
Never re-implement the cookie/JWT/role dance in a handler. Two lines:
```ts
const auth = await requireRole(req, "manager");  // or requireAuth(req)
if (!auth.ok) return auth.response;              // 401 or 403, already shaped
// auth.staff is AdminPayload from here
```
Server components use `cookies()` from `next/headers`, so they still call
`verifyAdminToken` directly — `requireRole` is for route handlers only.

### Responses — `lib/api-response.ts`
Always return via a helper. Never hand-write `NextResponse.json({ success: ... })`
— that is how the payload key drifted to `promos` / `plan` / `booking` / `kpi`,
forcing every client to know a different key per endpoint.

| Helper | Shape |
|---|---|
| `ok(payload, status?)` | `{ success: true, data: <payload> }` |
| `okMessage(text, status?)` | `{ success: true, message: string }` — ack, no data |
| `okEmpty(status?)` | `{ success: true }` — deletes and similar |
| `fail(text, status?)` | `{ success: false, error: string }` |
| `failValidation(zodError)` | `fail()` with the first issue message |

**`error` is always a string.** Clients render it directly
(`showToast(data.error ?? "…")`), so returning a Zod error object shows
`[object Object]` to staff. Use `failValidation(parsed.error)`, never
`parsed.error.flatten()`.

Clients therefore always read `data.data` for payloads and `data.message`
for acknowledgements.

## Laundry (linen sent to the laundryman)
`/admin/housekeeping?tab=laundry` — models `LinenItem`, `LaundryBatch`,
`LaundryBatchItem`.

A batch goes out with a count per item type and comes back days later; the
difference is what went missing. Two rules the code depends on:
- **Quantities and rates are snapshotted per line** at dispatch, so editing
  the catalogue later never rewrites what a past batch cost.
- **A batch is only `returned` when every piece is accounted for.** Returned
  + damaged must equal sent; anything short keeps the batch `partial` so the
  missing pieces stay visible in the outstanding list. The API rejects a
  return larger than the dispatch — otherwise the outstanding count goes
  negative and the system invents linen.

Seed the catalogue with `npx tsx prisma/seed-linen.ts` (idempotent; upserts
by name and preserves rates edited in the admin panel).

## Seed scripts
```bash
npm run seed:admin                    # staff logins (see run-app skill)
npx tsx prisma/seed-rooms.ts          # ⚠️ destructive — wipes bookings
npx tsx prisma/normalize-rooms.ts     # reshape rooms, keeping bookings (dry run)
npx tsx prisma/seed-linen.ts          # linen catalogue
npx tsx prisma/seed-bookings.ts       # bookings around today
npx tsx prisma/repair-data.ts         # report drifted derived state (--apply to fix)
npx tsx prisma/close-overdue-checkouts.ts  # stays never checked out (--apply to close)
npx tsx prisma/seed-demo.ts           # demo data; idempotent (--prune drops old duplicates)
```

## Scheduled Jobs (`vercel.json` → `crons`)
| Path | Schedule (UTC) | Purpose |
|---|---|---|
| `/api/cron/night-audit` | `15 0 * * *` (05:45 IST) | Mark no-shows, flag arrivals/departures |
| `/api/cron/expire-holds` | `30 0 * * *` (06:00 IST) | Release rooms held by unpaid bookings |
| `/api/cron/detect-conflicts` | `45 0 * * *` (06:15 IST) | Double-booking safety net |

Constraints worth knowing before editing the schedule:
- **Vercel schedules in UTC**, not IST. `runNightAudit()` derives "yesterday"
  from the server clock, so it must run shortly *after* UTC midnight. Moving it
  to midnight IST (18:30 UTC) would audit a day that is still in progress.
- **Both ends of the audit look backwards, and neither closes anything.**
  No-shows match `checkIn: { lt: today }` and due departures
  `checkOut: { lte: today }`, so a skipped run — or a checkout the desk never
  pressed — is caught up rather than lost at midnight (B-04, B-51). The audit
  only ever *flags* a departure: an overdue checkout is a real stay that ended,
  but the guest may equally still be in the room, and checking out issues a GST
  invoice. `overdueCheckouts` is returned separately from `dueCheckouts` so a
  backlog cannot hide inside today's number.
- **Hobby fires within the scheduled hour, not at the scheduled minute.** Vercel
  documents Hobby precision as ±59 minutes, so `15 0 * * *` lands somewhere in
  00:00–00:59 UTC — the times in the table above are nominal. That is still
  safely after UTC midnight, so `runNightAudit()`'s "yesterday" holds, but the
  three jobs' stagger is *not* an ordering guarantee: they can fire in any
  order. Nothing depends on it — `runNightAudit` sweeps stale holds itself as a
  backstop and the conflict detector is read-only — and nothing new should.
- **Cron jobs only run on Production deployments.** Not on previews, not on
  branch deploys. A cron that "never fires" is usually this.
- **Sub-daily schedules require a Pro plan** and fail at deploy time on Hobby.
  Hourly conflict detection would be better; on Pro use `"0 * * * *"`.
  **`expire-holds` wants hourly most of all** — daily means a room can show as
  unavailable for up to 24 hours after its hold went stale. The sweep is
  idempotent and bounded per run, so raising the frequency needs no other
  change. `createBooking` sweeps the room it is booking, which covers a guest
  looking straight at a held room; the cron is what keeps the *listing* honest.
- **`/api/cron/pull-ota` is deliberately unscheduled** — it targets eZee
  Centrix, which this property does not use. See `CHANNEL-MANAGER-PLAN.md`.

Auth: Vercel sends `Authorization: Bearer $CRON_SECRET` when `CRON_SECRET` is
set as a project env var. Guard every cron route with `denyIfNotCron(req)` from
`lib/cron-auth.ts` — never compare against `process.env.CRON_SECRET` inline,
which renders `"Bearer undefined"` and fails *open* when the var is missing.
**`CRON_SECRET` must be set in the Vercel project**, or every cron returns 503.

## Dates — `@db.Date` columns (`lib/dates.ts`)
`checkIn`, `checkOut`, `blockDate`, `validFrom/To`, `invoiceDate`, `Expense.date`,
`Shift.date` and friends are Postgres **DATE** columns. They hold a calendar
day, not an instant, and Postgres compares them by casting whatever bound you
pass down to a date.

**Never build a bound with local time.** `new Date(y, m, d)` and
`new Date("2026-12-20T00:00:00")` are local midnight — in IST that is
`…T18:30:00Z` on the *previous* day, which Postgres truncates straight back to
that previous day. This shipped three separate bugs: blocking 20–21 Dec stored
19–20 (so the closed day stayed bookable), the dashboard's "today" window
selected yesterday's arrivals and departures, and a report "from 1 Sep" quietly
started on 31 Aug.

Use the helpers instead — they answer "which day is it?" in the *property's*
timezone (the dev box runs IST, Vercel runs UTC) and always return UTC midnight:

| Helper | Use |
|---|---|
| `today()` | today at the property, as a DATE value |
| `dateOnly("2026-12-20")` | parse a `YYYY-MM-DD` input |
| `addDays(day, n)` | shift by whole days |
| `startOfMonth` / `addMonths` | month buckets |
| `daysBetween(a, b)` | whole days between two days |
| `toDayString(day)` | back to `YYYY-MM-DD` |

Ranges are half-open: `{ gte: start, lt: end }`. An inclusive `lte` on the last
day matches that whole day and pulls in one extra.

## Derived state that used to drift
Three things are computed from bookings rather than maintained incrementally,
because incremental updates silently fell out of sync:

- **`roomStatus.currentBookingId`** — only check-out used to clear it, so
  no-shows and cancellations left rooms pointing at dead bookings, showing that
  guest's name on the board forever. Call `releaseRoomsHolding(bookingIds)`
  whenever bookings end any way other than check-out.
- **`guest.totalStays` / `totalRevenue`** — kept only so the guest list can sort
  on them. Call `recalcGuestTotals(db, guestId)` after anything that changes a
  booking's status or amount; never `increment`/`decrement`. Cancelled and
  no-show bookings are excluded.

- **`roomStatus.occupancy` = `due_checkin`** — a statement about *today*, so
  `runNightAudit()` clears yesterday's before flagging today's arrivals rather
  than adding to them. Write `currentBookingId` alongside the flag: every path
  that frees a room (`releaseRoomsHolding`, the cancel route, `repair-data.ts`)
  filters on that column, and a flag set without one can never be cleared by
  any of them. That is how the board came to show seven rooms awaiting guests
  on a day with one arrival (B-48). Never reset a room that has a guest
  checked into it — a stale flag beats hiding someone who is in the room.

`npx tsx prisma/repair-data.ts` reports all three kinds of drift; `--apply`
fixes it. Idempotent and safe to re-run.

## Booking Flow
1. User picks dates → `/api/booking/availability?roomId=&checkIn=&checkOut=`
2. User sets the party size and composes it from the free rooms →
   `GET /api/booking/quote` prices it.

   **The guest counter lives on this step, not the date step.** Everything it
   governs is here — the per-card "Sleeps 2 (+1 with an extra bed)", the
   combination `suggestAllocation` picks, the "sleeps 5 of 6" tally and the
   price — and a number set a step earlier has to be remembered to make sense
   of any of them. Two things this depends on:
   - **It does not refetch availability.** Party size stopped being a filter on
     the room list with B-57 (a party of five may want two standards rather
     than the family room), so the list is every free room and only the
     suggestion depends on the headcount.
   - **Re-suggesting stops once the guest picks rooms themselves.**
     `setPartySize` re-runs `suggestAllocation` only while
     `selectionIsSuggested`; after the guest touches a card the selection is
     theirs, and a later counter press must not discard it.

   `MAX_PARTY` stays above the property's capacity on purpose. Capping the
   counter at what the dates can sleep would replace "We can sleep 9 guests on
   these dates, and there are 10 in your party — call us" with a button that
   silently stops.
3. Fill guest details form (React Hook Form + Zod) — the step-3 "Continue"
   button must `trigger()` validation before advancing. Errors render inside
   the step-3 markup, so advancing with invalid input unmounts them and step 4
   then refuses to submit with nothing shown to the guest.
4. POST `/api/booking/create` → creates Prisma Booking
   (`status: "confirmed"`, `paymentStatus: "pending"`) + Razorpay order
5. Razorpay checkout opens in browser (razorpay.js)
6. On success → POST `/api/payment/verify` → verify signature **and that the
   order belongs to the booking** → update status to "paid"
7. Redirect to `/booking/confirmation?id=...` + Resend email

### A party can take several rooms — `createGroupBooking`
No room in the property sleeps more than five (four, plus a rollaway), so a
larger party books several. `booking_groups` owns only what those rooms share:
the Razorpay order, the promo claim, and the number the guest quotes. Each room
stays its own `bookings` row, so the exclusion constraint, the night audit,
housekeeping, the calendar and every report need no knowledge of groups.

**Every website booking gets a group, a single-room stay included.**
`createBooking` is a one-room adapter over `createGroupBooking` — a
"is this a group?" branch is exactly how the two pricing paths and the two
counter allocators drifted apart before. A group of one keeps the plain
`BK-YYYYMMDD-NNN`; a party hangs `/1`, `/2` off it.

- **The guest picks room *types* and counts; the server picks the rooms.**
  `resolveSelection` turns `{ standard: 2, family: 1 }` into door numbers and
  decides which of them carry an extra bed. Beds follow from the headcount and
  are never a client field — a browser that could say "no extra bed" for a party
  of five books a room nobody sets a bed up in. Same rule as totals, below.
- **GST is per room, not per party.** The slab belongs to the tariff per room per
  night, so three ₹4,500 rooms stay at 12% rather than being pushed to 18% by a
  ₹13,500 sum. A promo discount is split across rooms in proportion to what each
  costs, with the rounding remainder on the last, so the parts sum to exactly
  what Razorpay was charged.
- **One order for the party.** Charging per room opens Razorpay N times for one
  reservation and leaves a family half-paid if they close the modal partway.
- **A party expires and reinstates whole.** `expireStalePaymentHolds` widens each
  candidate to its group and rolls the unit back on a short count;
  `/api/payment/verify` settles every room against the one order. Releasing two
  rooms of three leaves a family holding a booking they cannot sleep in.

Verify with `npx tsx prisma/verify-availability.ts` — books its way through the
whole property on far-future dates and asserts a booked room is never offered
again: not for an overlapping window, not to a party small enough to fit it, and
back on the listing the moment the booking is cancelled. It also walks every
party size from one to past the property's capacity, which is the case unit
tests keep proving against a mocked room list. Run it after touching
`getAvailableRooms`, `toCategories`, the allocator, or anything that decides
what a guest is shown. Cleans up after itself; safe to re-run.

**No total is ever computed in the browser.** Step 2 and step 4 both render
figures from `/api/booking/quote`, and the "Confirm Booking" button is disabled
until one arrives. The wizard used to show `pricePerNight × nights` as the
"Total Amount" while the server charged `quoteStay` → `applyGst` — GST plus any
weekend markup, roughly 18% more on a weekend. The guest approved one number and
Razorpay opened for another. The quote endpoint is read-only and deliberately
takes no promo code: `claimPromo` consumes a redemption, and a price preview
must not spend anything.

**The booking is committed before the Razorpay order exists.** `createBooking()`
commits the booking row, then updates the guest's `totalStays`/`totalRevenue`
and writes an audit row just after the commit — outside the transaction, so
neither can extend the room lock or fail the booking. `createOrder()` only runs
afterwards. If it throws, the
route must void the booking (`cancelled` + `paymentStatus: "failed"`) and
decrement the guest stats — otherwise a `confirmed` row with no order holds the
room on the calendar for a guest who only ever saw an error. Availability
queries skip `cancelled`/`failed`, so voiding is what frees the room.

Clients must not assume an error response has a JSON body: an unhandled route
error returns an empty 500, and a bare `res.json()` shows the guest
`"Unexpected end of JSON input"`. Parse with `.catch(() => null)` and fall back
to your own message.

### Payment verification binds the order to the booking
`verifySignature` only proves Razorpay authorised a given **(order, payment)**
pair. It says nothing about *whose* booking that is. `/api/payment/verify` must
therefore also check `booking.razorpayOrderId === razorpayOrderId` before
marking anything paid — the column exists on the row for exactly this.

Without that check the signature alone was enough to mark any booking paid:
book the cheapest room, pay for it, keep the triple the checkout handler
receives, then replay it against someone else's `bookingId`. Replaying a triple
against *its own* booking is answered idempotently — no second `Payment` row, or
the stay is double-counted in every revenue report.

There is no Razorpay webhook. This route is the only path to `paid`, so nothing
downstream compensates for a weak check here.

**It also checks the booking is still live.** The signature and the order check
both pass for a booking `expireStalePaymentHolds()` has already cancelled — the
order genuinely does belong to it. A guest who leaves the Razorpay modal open
past `BOOKING_HOLD_MINUTES` and then pays used to be charged for a stay whose
room was already back on the calendar, and emailed "Booking Confirmed!" while
the confirmation page told them the opposite. The sweeper's Razorpay check does
not prevent this: it rules out a booking that was *already* paid, not one paid a
moment later.

So `status` is selected too, and a `cancelled`/`no_show` booking takes a
different path:

- **Try to give the room back first.** Reinstatement goes through
  `guardRoomAvailability` like every other path that writes a booking, and
  flips the row to `confirmed`/`paid` inside that transaction so the exclusion
  constraint backstops it at commit. This is the common case — a hold expiring
  does not mean anyone else took the room in the seconds since.
- **Otherwise confirm nothing and send no email.** The payment is written to
  `payments` as `completed`, noted for refund, and audited with
  `needsRefund: true`; `razorpayPaymentId` is stamped on the booking so a
  replay cannot write a second row. The booking stays `cancelled`, so the money
  never reaches a revenue report — it is a refund waiting to happen, not
  income.

A stay that has already started is never reinstated: that is the no-show case,
and a late payment against it is a refund, not a check-in.

### Unpaid holds expire — `expireStalePaymentHolds()`
A booking committed at step 4 holds the room until the guest pays. Nothing used
to release it: availability skips only `cancelled`/`no_show`/`failed`, the night
audit ignores a booking until its check-in day, and no cron swept. A December
stay abandoned in August was off the calendar for four months.

Holds older than `BOOKING_HOLD_MINUTES` (default 60) are voided by
`expireStalePaymentHolds()`, which runs from three places: `createBooking`
(scoped to the one room being booked, so a guest is never blocked by a dead
hold), `/api/cron/expire-holds`, and `runNightAudit` as a backstop.

Two rules it must keep:
- **Only `source: "website"`.** A walk-in sits at `pending` when the desk takes
  payment on departure, and an OTA import is `pending` because the guest paid
  the channel. Cancelling either deletes a real stay.
- **Ask Razorpay before cancelling.** A booking that hit "you have paid but we
  could not confirm it" looks identical in our database to an abandoned one —
  both `pending` with no `razorpayPaymentId`, because the failure was in the
  verify step that would have written one. Only `"unpaid"` is cancelled;
  `"paid"` and `"unknown"` (API unreachable) keep the room and log for staff.
  The cancelling write is a compare-and-swap on `status`/`paymentStatus` so a
  payment landing mid-sweep cannot be undone.

A UPI booking is left `pending` on purpose while staff confirm a transfer
manually, and **will** be swept after the hold window — 60 minutes against the
15 the confirmation screen promises.

## Pricing — `quoteStay` / `applyGst` (`lib/booking-service.ts`)
**Every booking path prices through these two.** There were two implementations:
the walk-in route priced off `room.baseRate` with no rate plan, no weekend
markup and no extra bed, while the website used the rate plan for all three.
They agreed only because no rate plan existed — the first one a manager created
from `/admin/setup` would have made walk-ins quietly cheaper than the same room
booked online, with no error anywhere.

Split in two because the promo claim sits between the halves: the discount a
code buys depends on the subtotal, so `quoteStay` → `claimPromo` → `applyGst`.

- **The no-rate-plan fallback is `room.pricePerNight`, not `room.baseRate`.**
  The public site displays `pricePerNight`; pricing off the other column could
  charge a guest more than the page quoted them. `baseRate` is still stored and
  editable in the admin panel but no longer feeds pricing.
- **An extra bed is priced from the room**, not only from a rate plan.
  `rooms.extra_bed_rate` (₹1,000 as seeded) is the tariff; a rate plan overrides
  it *only* by naming a non-zero `extraBedRate`, because that column defaults to
  0 and treating 0 as "free" is how every rollaway was billed at ₹0 with no rate
  plan in the database (B-57). A genuinely free bed is a promo, not a tariff.
- **The weekend markup lifts the room rate only.** A rollaway is a flat add-on —
  a mattress, linen and a breakfast cover — and none of it costs more on a
  Saturday.
- **A room sleeps `maxGuests + 1` when `extraBed` is set.** Capacity, pricing and
  availability all have to agree on that; filtering availability on `maxGuests`
  alone told a party of five the property was full while five rooms stood empty.

  **One rollaway per room is a deliberate cap, 105 included.** `Room.extraBed`
  and `Booking.extraBed` are booleans on purpose — a second bed in any room is
  unrepresentable end to end, and `allocate` assigns at most one per room. The
  question was put to the owner for room 105 specifically, which physically has
  two beds sleeping 4 and could take a second rollaway; the answer was to keep
  it at one. So 105 sleeps 5, the property sleeps 29, and a party of six takes
  two rooms. That is the property's decision, not a gap to close — do not
  "correct" it into `maxExtraBeds: 2` without asking first.
- **The GST slab follows the discounted amount**, so a promo can move a stay
  from 18% to 12%.

`rateOverride` is the front desk negotiating a nightly rate. It replaces the
whole tariff: no rate plan, no weekend markup, no extra bed on top — the desk
quoted a number and that is what the guest pays. Overrides are recorded in the
audit log (`rateOverridden`, `nightlyRate`) because they are the one figure a
manager may need to question later. Any `frontdesk` user can set one; there is
no approval step.

## Strings (`messages/en.json`)
**This site is English-only. Do not add Hindi, Marathi, or any other locale.**
`middleware.ts` registers `locales: ["en"]` and `i18n.ts` always loads
`en.json`; `/hi` and `/mr` 404 by design. next-intl is kept purely as the
string store so copy lives in one file instead of being scattered in JSX.

- `useTranslations('namespace')` in client components
- `getTranslations('namespace')` in server components / metadata
- Keys live in `messages/en.json`, grouped by namespace

**Page titles and descriptions are copy too**, and live under the `meta`
namespace. A page supplies them in one line —
`export const generateMetadata = () => pageMetadata("about");` from
`lib/page-metadata.ts`. Two rules the root template imposes:

- **Never put the brand in a page title.** `app/layout.tsx` sets
  `template: "%s | Rio Casa Mahabaleshwar"`, so "Rooms — Rio Casa" renders as
  "Rooms — Rio Casa | Rio Casa Mahabaleshwar". The blog and privacy pages both
  did this (B-52); a test now fails on any title containing "Rio Casa".
- **The home page sets nothing on purpose.** `title.default` applies verbatim
  and the template only wraps child titles, so `/` gets the unsuffixed default.

A client component cannot export metadata — give it a sibling `layout.tsx`, as
`/contact` and `/gallery` have.

**Mind the namespace.** A key read from the wrong one renders the raw key path
to the visitor — next-intl does not fall back. `perNight` lives under `rooms`,
and reading it as `booking.perNight` is how the booking wizard once showed
guests "₹5,500 booking.perNight". Missing keys log
`IntlError: MISSING_MESSAGE` in the console; that error is worth grepping for
after touching copy.

## Running Locally
```bash
npm run dev          # Start dev server on :3000
npx prisma studio    # Open DB GUI
npx prisma migrate dev --name <name>   # Create + apply a migration (local only)
npx prisma migrate deploy              # Apply pending migrations (shared/prod)
npx prisma migrate status              # What's applied where
```

### Prisma 7
The client is **Rust-free** — generated TypeScript in `lib/generated/prisma`
(gitignored, built by `prisma generate`, already wired into `npm run build`).
That took the deployed client from ~47 MB to ~1.9 MB with no native binary,
which is the whole reason for being on 7.

Consequences worth knowing before editing anything database-shaped:

- **A driver adapter is mandatory.** `lib/prisma.ts` uses `@prisma/adapter-pg`.
  There is no built-in connection layer any more.
- **Import from `@/lib/generated/prisma/client`,** not `@prisma/client` — the
  client is no longer generated into `node_modules`.
- **`datasource.url` is gone from `schema.prisma`.** The CLI reads it from
  `prisma.config.ts`; the runtime gets it via the adapter.
- **`.env` is not auto-loaded.** `prisma.config.ts` and `prisma/script-client.ts`
  both `import "dotenv/config"` for this reason.
- **Client middleware (`$use`) was removed.** Use client extensions.

### Booking concurrency
`createBooking` holds a SERIALIZABLE transaction with `SELECT … FOR UPDATE` on
the room row, so simultaneous bookings for one room serialise. Three things keep
that from surfacing as noise:

- **Pool size** (`DATABASE_POOL_MAX`, default 20). node-postgres defaults to 10;
  waiters then could not open a transaction at all and failed with `P2028`.
- **`withSerializableRetry`** retries `P2034`/`P2028` with jittered backoff.
  Postgres SERIALIZABLE *expects* clients to retry — without it, losing requests
  reached guests as "Something went wrong."
- **`maxWait: 15s` / `timeout: 20s`** on the transaction, because a waiter
  legitimately needs longer than one transaction's worth of time.

`ROOM_NOT_AVAILABLE` and `BLOCKED_DATE` are deterministic and never retried.
A serialization failure raised by a **raw** query is not `P2034` — Prisma
reports it as `P2010` with SQLSTATE `40001` in `meta.code`. Both the room lock
and the availability re-check are raw, so `isTransientTxError` matches on the
SQLSTATE as well; matching only on `P2034` means every loser of a race reaches
the guest as "Something went wrong."

#### Keep the critical section short
Bookings for one room run strictly one at a time, so the Nth guest in the queue
waits for everyone ahead of them. **The length of the critical section, not the
length of the request, is what sets the tail latency.** Twelve concurrent
bookings for one room took ~22s when the transaction did all of its work under
the lock; the same test now runs ~12s with every loser cleanly rejected.

**A party locks every room in one ordered pass.** `guardRoomsAvailability` takes
them with `ORDER BY id … FOR UPDATE`, and that ordering is the point: two
parties overlapping on rooms — one taking {101, 105}, the other {105, 101} —
deadlock if each locks in the order its guest happened to pick. Postgres locks
at the `LockRows` node above the sort, so the sort order *is* the lock order.
`guardRoomAvailability` is the one-room wrapper over it.

**Every path that writes a booking goes through `guardRoomAvailability(tx, …)`**
— it takes the `FOR UPDATE` and re-checks conflicts *and* blocked dates in one
round trip. It is a shared function because the admin walk-in route used to
hand-roll its own check: no lock, no blocked-date test, and a conflict predicate
that disagreed with this one about failed payments, so a room the calendar
showed as free could not be booked at the front desk. New booking routes call
it; they do not write their own availability query.

Only three things run with the room locked: the `FOR UPDATE`, the availability
re-check, and the insert. When adding to a booking path, put the new work in
whichever of these is true:

| Where | For work that… | Examples |
|---|---|---|
| Before the transaction | cannot be invalidated by a competing booking | rate plan, pricing, GST, promo claim, booking number |
| Inside the tx, before `FOR UPDATE` | needs the isolation but not the room | the guest lookup/create |
| Under the lock | decides whether the room is free | the re-check, the insert |
| After the commit | is bookkeeping | guest totals, audit log |

Post-commit bookkeeping is deliberately non-fatal: a booking that exists must
not be lost because an audit row failed. That is why guest totals are repairable
(`prisma/repair-data.ts`) rather than transactional.

Do **not** fan the pre-transaction reads out with `Promise.all` — two pool
connections per in-flight request is how contention turned into `P2028`.

Verify with `npx tsx prisma/verify-booking-race.ts [n]` — fires n simultaneous
bookings at one room, asserts exactly one wins, and reports the latency spread.
Run it after touching the transaction, the isolation level, the pool, or the
Prisma version. Unit tests mock the database and cannot catch any of this.
Pipe it to `tail`, never `head`: SIGPIPE kills the script before its cleanup and
leaves a booking behind that fails every later run.

#### Daily document numbers — `nextDailyNumber(scope, prefix, day, pad)`
`<PREFIX>-YYYYMMDD-NNN`, allocated by a one-row upsert on `daily_counters`.
One row per `(scope, day)`, so each document type has its own sequence:

| Caller | Scope | Shape |
|---|---|---|
| `nextBookingNumber(day)` — website **and** admin walk-in | `booking` | `BK-20260901-001` |
| `POST /api/admin/laundry` | `laundry` | `LB-20260727-01` |

**Never derive one of these with `COUNT(*)`.** Both callers used to, and both
were broken the same way: two writers on the same day read the same count,
compute the same suffix, and the second insert dies on a unique index —
reported to a guest as "this room was just booked" and to housekeeping as
"Server error", with the linen already handed over. For bookings it was worse
still: the prefix came from the check-in day while the count window came from
`created_at`, so **every advance booking for the same date computed `-001`**,
and a COUNT over a predicate takes a predicate lock that let bookings for
unrelated rooms abort each other.

One table and one function on purpose. A second allocator for laundry would
have been less code to write and is exactly how the two booking paths drifted
apart before.

Allocation sits outside the surrounding transaction, so a failed write burns a
number. Gaps are expected; duplicates are not.

**Backfill before you point a new scope at this.** Starting a sequence at zero
for a day that already has numbers in circulation re-issues one and fails on the
unique index — see `4_daily_counters` for the pattern.

#### Promo codes
`claimPromo` reserves a use with a single guarded `UPDATE … WHERE (usage_limit
IS NULL OR used_count < usage_limit)`, so the cap is enforced by the statement
itself and needs no surrounding transaction. Claiming happens *before* the
booking transaction — a shared counter row touched under SERIALIZABLE is
contention between bookings that have nothing to do with each other. Because
the claim precedes the availability decision, `createBooking` must hand it back
via `releasePromoClaim` on any failure, or losing a race burns a redemption.

### Migrations
The schema is under migration control as of `0_init`, which was **baselined**
from the existing database — it was generated with `migrate diff` and marked
applied, not replayed. The migrations are:

| Migration | Contents |
|---|---|
| `0_init` | Every table, index and FK in `schema.prisma` |
| `1_double_booking_guard` | `btree_gist`, the `no_overlapping_bookings` exclusion constraint, and the five hand-written indexes |
| `2_booking_counter` | `booking_counters`, backfilled from the highest `BK-` suffix already issued per date |
| `3_blocked_dates_unique` | Two **partial** unique indexes on `blocked_dates` — `room_id` is nullable and means "every room", and a plain `UNIQUE` treats NULLs as distinct |
| `4_daily_counters` | `daily_counters` (`scope`, `day`), replacing `booking_counters`; laundry sequences backfilled |
| `6_room_extra_bed_rate` | `rooms.extra_bed_rate`, backfilled to ₹1,000 for every room that takes one |
| `7_booking_groups` | `booking_groups` and `bookings.group_id` — one reservation, several rooms |

**`\d` does not work in this database's regex operator.** `'LB-20260727-01' ~
'^LB-\d{8}-\d+$'` evaluates *false* on Neon while the `[0-9]` form is true, so
use bracket classes in migration SQL. A backfill whose predicate matches
nothing fails silently and then hands out a number that already exists —
`2_booking_counter` has the `\d` form and is logged as B-22 in `BUGS.md`
(`4_daily_counters` re-runs that backfill correctly, so it is closed in
practice).

`1_double_booking_guard` holds objects Prisma cannot express in the schema. It
was previously a loose `prisma/add_exclusion_constraint.sql` that had to be run
by hand with `psql` — and **it never was**, so the live database ran without
Layer 1 while the code claimed it was protected. Anything that cannot live in
`schema.prisma` belongs in a migration, never in a file someone is expected to
remember.

**`DATABASE_URL` points at Neon.** Two consequences:
- Never run `migrate dev` or `migrate reset` against it — both can drop data.
  Use `migrate deploy`.
- Neon times out Prisma's advisory lock. Prefix with
  `PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1` and use the **direct** endpoint
  (hostname without `-pooler`) for DDL.

The exclusion constraint rejects a second overlapping booking outright, so
`createBooking` can hit a raw constraint violation on `no_overlapping_bookings`
under a race — that is Layer 1 doing its job, not a bug.

### Browser testing
`node scripts/shot.mjs <path>` screenshots a page (admin login handled) — the
fast check that something still renders. For interactive testing, console
errors, or network inspection, the `chrome-devtools` MCP server in `.mcp.json`
drives a real Chrome. See the `run-app` and `test-in-chrome` skills.

## Environment Variables
See `.env` — copy to `.env.local` and fill in real values:
- `DATABASE_URL` — PostgreSQL connection string
- `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` — from Razorpay dashboard
- `RESEND_API_KEY` — from resend.com
- `NEXT_PUBLIC_WHATSAPP_NUMBER` — resort WhatsApp number (with country code, no +)
- `JWT_SECRET` — signs admin sessions. **Required in production**: without it
  every login 500s and every session 401s, on purpose. The committed
  development fallback is public, so reaching it in production would let anyone
  who can read this repository mint an `owner` token. Fails shut, like
  `CRON_SECRET`.
- `BOOKING_HOLD_MINUTES` — optional, default 60. How long an unpaid website
  booking keeps its room before `expireStalePaymentHolds()` voids it.
