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
.btn-primary          Green filled button
.btn-outline          Green outline button
.section-heading      Serif h2/h3 style
.section-subheading   Italic serif subtitle
.container-resort     max-w-7xl centered with padding
```

## API Conventions
- All API routes live in `app/api/**`
- Validate body with Zod before any DB call
- Return `{ success: true, data: ... }` or `{ success: false, error: "..." }`
- Razorpay webhook: verify `x-razorpay-signature` header before updating booking status

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
