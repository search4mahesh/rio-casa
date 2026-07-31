# Rio Casa Resort Website — CLAUDE.md

## Project Overview
Full-featured resort website for **Rio Casa**, Mahabaleshwar, Maharashtra.
Goals: direct bookings, brand presence, event/package promotion.

## Tech Stack
- **Next.js 14** — App Router, TypeScript, `app/` directory
- **Tailwind CSS v3** — design tokens in `tailwind.config.js`
- **next-intl** — trilingual: English (`en`), Hindi (`hi`), Marathi (`mr`)
- **Prisma + PostgreSQL** — bookings, rooms, packages, blog, testimonials
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
  en.json / hi.json / mr.json   All UI strings — NEVER hardcode text
prisma/
  schema.prisma       DB schema (Room, Booking, Package, Testimonial, BlogPost)
```

## Strict Rules
1. **No hardcoded UI text** — every visible string must use `useTranslations()` from next-intl
2. **Tailwind only** — no inline styles, no CSS modules (except globals.css for @layer)
3. **Server Components by default** — only add `"use client"` when you need interactivity or hooks
4. **Zod schemas** — validate all API request bodies at the route handler level
5. **Prisma via singleton** — always import from `@/lib/prisma`, never `new PrismaClient()`

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
```

## Scheduled Jobs (`vercel.json` → `crons`)
| Path | Schedule (UTC) | Purpose |
|---|---|---|
| `/api/cron/night-audit` | `15 0 * * *` (05:45 IST) | Mark no-shows, flag arrivals/departures |
| `/api/cron/detect-conflicts` | `45 0 * * *` (06:15 IST) | Double-booking safety net |

Constraints worth knowing before editing the schedule:
- **Vercel schedules in UTC**, not IST. `runNightAudit()` derives "yesterday"
  from the server clock, so it must run shortly *after* UTC midnight. Moving it
  to midnight IST (18:30 UTC) would audit a day that is still in progress.
- **Sub-daily schedules require a Pro plan** and fail at deploy time on Hobby.
  Hourly conflict detection would be better; on Pro use `"0 * * * *"`.
- **`/api/cron/pull-ota` is deliberately unscheduled** — it targets eZee
  Centrix, which this property does not use. See `CHANNEL-MANAGER-PLAN.md`.

Auth: Vercel sends `Authorization: Bearer $CRON_SECRET` when `CRON_SECRET` is
set as a project env var. Guard every cron route with `denyIfNotCron(req)` from
`lib/cron-auth.ts` — never compare against `process.env.CRON_SECRET` inline,
which renders `"Bearer undefined"` and fails *open* when the var is missing.
**`CRON_SECRET` must be set in the Vercel project**, or every cron returns 503.

## Booking Flow
1. User picks dates + guests → `/api/booking/availability?roomId=&checkIn=&checkOut=`
2. User selects room → clicks "Book Now"
3. Fill guest details form (React Hook Form + Zod)
4. POST `/api/booking/create` → creates Prisma Booking (status: pending) + Razorpay order
5. Razorpay checkout opens in browser (razorpay.js)
6. On success → POST `/api/payment/verify` → verify signature → update status to "paid"
7. Redirect to `/booking/confirmation?id=...` + Resend email

## i18n Rules
- Locale prefix: `en` (default, no prefix in URL), `/hi/...`, `/mr/...`
- `useTranslations('section')` in client components
- `getTranslations('section')` in server components / metadata
- Keys live in `messages/{locale}.json`

## Running Locally
```bash
npm run dev          # Start dev server on :3000
npx prisma studio    # Open DB GUI
npx prisma migrate dev --name <name>   # Run migration
```

## Environment Variables
See `.env` — copy to `.env.local` and fill in real values:
- `DATABASE_URL` — PostgreSQL connection string
- `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` — from Razorpay dashboard
- `RESEND_API_KEY` — from resend.com
- `NEXT_PUBLIC_WHATSAPP_NUMBER` — resort WhatsApp number (with country code, no +)
