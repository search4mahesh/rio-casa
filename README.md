# Rio Casa Resort — Website & Admin Portal

Full-featured resort website with integrated Property Management System (PMS) for **Rio Casa**, Mahabaleshwar, Maharashtra.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [First-Time Setup](#first-time-setup)
- [Starting the Server](#starting-the-server)
- [Admin Portal](#admin-portal)
- [Website Pages](#website-pages)
- [Project Structure](#project-structure)
- [Environment Variables](#environment-variables)
- [Database](#database)
- [Scripts Reference](#scripts-reference)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router, TypeScript) |
| Styling | Tailwind CSS v3 |
| Database | PostgreSQL via Prisma ORM |
| Auth | JWT (jose) + bcrypt |
| Payments | Razorpay (cards, UPI, net banking) |
| Email | Resend |
| i18n | next-intl — English, Hindi, Marathi |
| Forms | React Hook Form + Zod |
| Hosting (DB) | Neon.tech (free serverless PostgreSQL) |

---

## Prerequisites

- **Node.js 20+** — [nodejs.org](https://nodejs.org)
- **npm 10+** — included with Node.js
- A **Neon.tech** account (free) for the database — [neon.tech](https://neon.tech)

Verify your versions:

```bash
node --version   # should be v20 or higher
npm --version    # should be 10 or higher
```

---

## First-Time Setup

Do this **once** when setting up the project on a new machine.

### 1. Install dependencies

```bash
cd "c:\work\Apps\Rio Casa"
npm install
```

### 2. Configure environment variables

Copy `.env` and fill in your real values:

```bash
copy .env .env.local
```

Open `.env` and update:

```env
# Required — get from neon.tech dashboard
DATABASE_URL="postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require"

# Required — generate a random string (min 32 chars)
JWT_SECRET="your-random-secret-here"

# Optional for demo — needed for real payments
RAZORPAY_KEY_ID="rzp_test_xxxxxxxxxxxx"
RAZORPAY_KEY_SECRET="xxxxxxxxxxxxxxxxxxxx"
NEXT_PUBLIC_RAZORPAY_KEY_ID="rzp_test_xxxxxxxxxxxx"

# Optional for demo — needed for booking emails
RESEND_API_KEY="re_xxxxxxxxxxxx"
```

### 3. Set up the database

Push the schema to your Neon database:

```bash
npx prisma db push
```

### 4. Create the admin user

```bash
npm run seed:admin
```

This creates:
- **Email:** `admin@riocasa.in`
- **Password:** `admin123`

> Change the password after first login.

### 5. (Optional) Load demo data

Populates rooms, guests, bookings, housekeeping tasks, packages and testimonials for a realistic demo:

```bash
npx tsx prisma/seed-demo.ts
```

---

## Starting the Server

### Development (with hot reload)

```bash
npm run dev
```

Server starts at **http://localhost:3000**

### Production build

```bash
npm run build
npm run start
```

---

## Admin Portal

Access the admin panel at **http://localhost:3000/admin/login**

| Credential | Value |
|---|---|
| Email | `admin@riocasa.in` |
| Password | `admin123` |

### Admin Pages

| Page | URL | Description |
|---|---|---|
| Dashboard | `/admin/dashboard` | Today's check-ins/outs, occupancy, revenue, upcoming arrivals |
| Front Desk | `/admin/rooms` | Room cards (current status) + 14-day occupancy grid |
| Bookings | `/admin/bookings` | All bookings with filters, check-in/out actions, walk-in booking |
| Guests | `/admin/guests` | Guest directory with booking history |
| Housekeeping | `/admin/housekeeping` | Task management — create, assign, and track cleaning/maintenance tasks |
| Invoices | `/admin/invoices` | GST-compliant invoice listing |
| Settings | `/admin/settings` | Hotel info + staff management |

### Occupancy Grid

The **Front Desk → Occupancy Grid** tab shows a 14-day calendar view of all room bookings:

- **Forest green** bar = guest currently checked in
- **Blue** bar = confirmed upcoming booking
- **Gray** bar = past checked-out stay
- Click any bar to open the booking detail
- Arrow on bar edge means booking extends beyond the visible window

---

## Website Pages

| Page | URL | Description |
|---|---|---|
| Home | `/` | Hero, featured rooms, packages, testimonials |
| Rooms | `/rooms` | All rooms listing |
| Room Detail | `/rooms/[slug]` | Individual room with booking widget |
| Booking | `/booking` | Booking wizard (dates → room → payment) |
| Packages | `/packages` | Special offers and packages |
| Gallery | `/gallery` | Photo gallery |
| About | `/about` | About Rio Casa |
| Dining | `/dining` | Dining and amenities |
| Blog | `/blog` | Travel blog |

**Multilingual:** Prefix any URL with `/hi/` (Hindi) or `/mr/` (Marathi).  
Example: `http://localhost:3000/hi/rooms`

---

## Project Structure

```
app/
  [locale]/          Website pages (en/hi/mr)
  admin/             Admin portal
  api/               API routes
    admin/           Admin APIs (auth, bookings, rooms, guests, housekeeping, invoices, staff, occupancy)
    booking/         Public booking APIs (availability, create)
    payment/         Razorpay payment verification
    contact/         Contact form

components/
  admin/             AdminSidebar
  booking/           BookingWizard, DatePicker, PaymentStep
  layout/            Navbar, Footer, WhatsAppButton
  sections/          Hero, FeaturedRooms, Testimonials, etc.
  ui/                Shared primitives (Button, Card, Input)

lib/
  prisma.ts          Prisma client singleton
  admin-auth.ts      JWT auth helpers

messages/
  en.json            English strings
  hi.json            Hindi strings
  mr.json            Marathi strings

prisma/
  schema.prisma      Database schema
  seed-admin.ts      Creates admin user
  seed-demo.ts       Loads demo data
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Neon PostgreSQL connection string |
| `JWT_SECRET` | Yes | Secret for admin JWT tokens (min 32 chars) |
| `RAZORPAY_KEY_ID` | For payments | From Razorpay dashboard |
| `RAZORPAY_KEY_SECRET` | For payments | From Razorpay dashboard |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | For payments | Same as KEY_ID (public) |
| `RESEND_API_KEY` | For emails | From resend.com |
| `EMAIL_FROM` | For emails | Sender address (e.g. `bookings@riocasa.in`) |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | Optional | WhatsApp number with country code, no `+` |
| `NEXT_PUBLIC_SITE_URL` | Optional | Full site URL (e.g. `https://riocasa.in`) |
| `CRON_SECRET` | Optional | Secret for cron job endpoints |

---

## Database

### View data (Prisma Studio)

```bash
npx prisma studio
```

Opens a visual DB browser at **http://localhost:5555**

### Schema changes

After editing `prisma/schema.prisma`:

```bash
npx prisma db push          # push changes (dev, no migration file)
# or
npx prisma migrate dev --name describe-your-change   # create a migration file
```

### Reset and re-seed (caution — deletes all data)

```bash
npx prisma db push --force-reset
npm run seed:admin
npx tsx prisma/seed-demo.ts
```

---

## Scripts Reference

| Command | Description |
|---|---|
| `npm run dev` | Start development server on :3000 |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run seed:admin` | Create admin user |
| `npx tsx prisma/seed-demo.ts` | Load demo data |
| `npx prisma db push` | Sync schema to database |
| `npx prisma studio` | Open visual DB browser |

---

## Design Tokens

| Token | Value | Usage |
|---|---|---|
| `primary` | `#4A6741` | Forest green — buttons, accents |
| `accent` | `#8B6914` | Golden brown — highlights |
| `earth-bg` | `#F5F0E8` | Warm cream — page background |
| `earth-text` | `#2C2416` | Dark earth — body text |
| Font (headings) | Cormorant Garamond | Serif, elegant |
| Font (body) | DM Sans | Clean, readable |
| Font (Hindi/Marathi) | Noto Sans Devanagari | Devanagari script |
