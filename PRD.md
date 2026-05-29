# Rio Casa — Product Requirements Document

**Property:** Rio Casa Resort, Mahabaleshwar, Maharashtra  
**Stack:** Next.js 14 · TypeScript · Prisma · PostgreSQL (Neon) · Tailwind CSS  
**Last updated:** 2026-05-28

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Currently Implemented — v1.0](#2-currently-implemented--v10)
3. [Admin Module Enhancements](#3-admin-module-enhancements)
   - [F-01 Booking Calendar (Timeline View)](#f-01-booking-calendar-timeline-view)
   - [F-02 Quick Check-in / Check-out](#f-02-quick-check-in--check-out)
   - [F-03 Blocked Dates Manager](#f-03-blocked-dates-manager)
   - [F-04 Night Audit Panel](#f-04-night-audit-panel)
   - [F-05 Rate Plans Manager](#f-05-rate-plans-manager)
   - [F-06 Promo Code Manager](#f-06-promo-code-manager)
   - [F-07 Occupancy & Revenue Reports](#f-07-occupancy--revenue-reports)
   - [F-08 Guest Profile Page](#f-08-guest-profile-page)
   - [F-09 Bulk Guest Communication](#f-09-bulk-guest-communication)
   - [F-10 Reviews Tracker](#f-10-reviews-tracker)
   - [F-11 Maintenance Flags Dashboard](#f-11-maintenance-flags-dashboard)
   - [F-12 Invoice PDF Download](#f-12-invoice-pdf-download)
   - [F-13 Staff Shift Schedule](#f-13-staff-shift-schedule)
4. [Implementation Roadmap](#4-implementation-roadmap)
5. [Schema Changes Required](#5-schema-changes-required)

---

## 1. Project Overview

Rio Casa is a boutique resort in Mahabaleshwar with 9 rooms across 3 types (Deluxe, Premium, Family). The system serves two audiences:

- **Guests** — public website for browsing, booking, and payment (Razorpay)
- **Staff / Owner** — admin portal (JWT-protected) for managing the full property operation

The admin portal currently covers core PMS (Property Management System) operations. This PRD documents all planned enhancements to the admin module.

---

## 2. Currently Implemented — v1.0

| Module | Status | Route |
|---|---|---|
| Admin login / logout | ✅ Done | `/admin/login` |
| Dashboard | ✅ Done | `/admin/dashboard` |
| Front Desk (Occupancy Grid) | ✅ Done | `/admin/rooms` |
| Bookings list + detail | ✅ Done | `/admin/bookings` |
| Guests list | ✅ Done | `/admin/guests` |
| Housekeeping tasks | ✅ Done | `/admin/housekeeping` |
| Invoices list | ✅ Done | `/admin/invoices` |
| Expense tracking | ✅ Done | `/admin/expenses` |
| Reconciliation (P&L) | ✅ Done | `/admin/reconciliation` |
| Settings | ✅ Done | `/admin/settings` |

**Sidebar groups:** Dashboard · Operations (Front Desk, Bookings, Guests, Housekeeping) · Finance (Invoices, Expenses, Reconciliation) · Settings

---

## 3. Admin Module Enhancements

---

### F-01 Booking Calendar (Timeline View)

**Priority:** P0 — Critical  
**Effort:** Large (3–4 days)

#### Purpose
A horizontal Gantt-style timeline showing all rooms on the Y-axis and dates on the X-axis. Bookings appear as color-coded bars. This is the most-used view in any hotel PMS — it gives the owner a complete picture of occupancy at a glance without opening individual bookings.

#### User Stories
- As an owner, I want to see all rooms and their bookings for the current month so that I know which rooms are free on any given day.
- As a front-desk staff member, I want to click an empty cell to create a walk-in booking directly from the calendar.
- As staff, I want to click an existing booking bar to see guest name, check-in/out dates, and status.

#### Functional Requirements
- Default view: current month, all rooms visible
- Navigate backward/forward by month
- Each booking bar shows: guest name (truncated), number of nights, status color
  - `confirmed` → green
  - `checked_in` → blue
  - `checked_out` → grey
  - `cancelled` → red with strikethrough
  - `no_show` → orange
- Blocked dates shown as diagonal-stripe pattern
- Click empty cell → open "New Booking" drawer (pre-filled with room + date)
- Click booking bar → open booking detail side-panel (read-only summary + link to full booking page)
- Responsive: horizontal scroll on mobile

#### Route Plan
- Page: `/admin/calendar`
- API: `GET /api/admin/calendar?month=YYYY-MM` → returns bookings + blocked dates for all rooms in range

#### Schema Impact
No new models needed. Uses existing `Booking`, `Room`, `BlockedDate`, `RoomStatus`.

#### UI Layout
```
[← May 2026]  [Jun 2026]  [Jul 2026 →]

Room          | 1  2  3  4  5  6  7  8  9  10 ...
──────────────┼─────────────────────────────────
Deluxe 101    |    [═══ Sharma ════]        [══
Deluxe 102    | [══ Patil ══]   [═ Kumar ═]
Deluxe 103    |                      [══════════
Premium 201   |         [══ Mehta ═══════]
Family 301    | [══════ Verma ══════════]
```

---

### F-02 Quick Check-in / Check-out

**Priority:** P0 — Critical  
**Effort:** Small (1 day)

#### Purpose
The front desk needs to mark a guest as checked-in or checked-out in one click, without navigating to the full booking page. Currently status updates require going into the booking detail — too slow during busy arrivals.

#### User Stories
- As front-desk staff, I want to click "Check In" next to a booking on the Front Desk board so that the room status updates to `checked_in` immediately.
- As front-desk staff, I want to click "Check Out" to mark a departure, which triggers a housekeeping task automatically.
- As owner, I want check-in time recorded (actualCheckin) so I have an audit trail.

#### Functional Requirements
- Front Desk board (`/admin/rooms`) shows action buttons per room:
  - Room with `due_checkin` booking → **Check In** button (green)
  - Room with `checked_in` booking → **Check Out** button (red)
- Check-in action:
  - Sets `Booking.status = "checked_in"`, `Booking.actualCheckin = now()`
  - Sets `RoomStatus.occupancy = "occupied"`, `currentGuestId`, `currentBookingId`
  - Writes AuditLog entry
- Check-out action:
  - Sets `Booking.status = "checked_out"`, `Booking.actualCheckout = now()`
  - Sets `RoomStatus.occupancy = "vacant"`, clears `currentGuestId`
  - Auto-creates a `HousekeepingLog` task (type: `checkout_clean`, status: `pending`)
  - Writes AuditLog entry
- Confirmation dialog before both actions (cannot be undone easily)

#### Route Plan
- `POST /api/admin/bookings/[id]/checkin`
- `POST /api/admin/bookings/[id]/checkout`

#### Schema Impact
No new models. Uses `Booking.actualCheckin`, `Booking.actualCheckout` (fields already exist).

---

### F-03 Blocked Dates Manager

**Priority:** P0 — Critical  
**Effort:** Small (1 day)

#### Purpose
The `BlockedDate` table already exists in the schema and is checked during booking creation to prevent bookings on blocked dates. However, there is no admin UI to create, view, or delete blocked dates. This means the owner cannot block rooms for maintenance, owner stays, or seasonal closure.

#### User Stories
- As owner, I want to block Room 201 from 10–15 June for renovation so that guests cannot book it online during that period.
- As owner, I want to block all rooms on a specific date for a private event.
- As staff, I want to see all upcoming blocked dates in one place.

#### Functional Requirements
- Page at `/admin/settings/blocked-dates` (or tab within Settings)
- Table showing all upcoming blocked dates: Room, Date, Reason, Created by
- Filter by room or month
- Add block: room (or "All Rooms"), date range, reason (optional)
- Delete a block (with confirmation)
- Past blocks are shown greyed out, not deletable
- Blocks appear on the Booking Calendar (F-01) as striped cells

#### Route Plan
- `GET /api/admin/blocked-dates?month=YYYY-MM`
- `POST /api/admin/blocked-dates` — `{ roomId?, dateFrom, dateTo, reason }`
- `DELETE /api/admin/blocked-dates/[id]`

#### Schema Impact
`BlockedDate` model already exists. Current schema stores one date per record — the API needs to expand a date range into individual `BlockedDate` records on creation.

---

### F-04 Night Audit Panel

**Priority:** P1 — High  
**Effort:** Small (1 day)

#### Purpose
`runNightAudit()` already exists in `lib/booking-service.ts` and performs end-of-day operations (mark no-shows, flag due checkouts, flag arrivals). There is no UI to trigger it manually or review results. The owner currently has no daily summary they can glance at.

#### User Stories
- As owner, I want to run the night audit each evening and see a summary: how many check-ins today, check-outs, no-shows, and today's revenue.
- As owner, I want to see which bookings were automatically marked as no-show so I can decide whether to follow up.

#### Functional Requirements
- Panel on the Dashboard or dedicated `/admin/night-audit` page
- Shows today's summary (auto-computed on page load):
  - Arrivals (confirmed bookings with checkIn = today)
  - Departures (checked-in bookings with checkOut = today)
  - No-shows (confirmed bookings with checkIn = yesterday, not checked in)
  - In-house guests (all currently checked_in)
  - Today's revenue (sum of paid bookings with checkIn = today)
- "Run Night Audit" button → calls the audit function, shows results inline
- Audit results: list of bookings that changed status + count
- Last-run timestamp shown

#### Route Plan
- `GET /api/admin/night-audit/summary` — today's counts
- `POST /api/admin/night-audit/run` — triggers `runNightAudit()`

#### Schema Impact
None. Uses existing models.

---

### F-05 Rate Plans Manager

**Priority:** P1 — High  
**Effort:** Medium (2 days)

#### Purpose
The `RatePlan` model exists in the schema and is used by `createBooking()` to apply seasonal rates and weekend markup. However, there is no UI to create or manage rate plans. Currently pricing is controlled only by `Room.pricePerNight` — there is no way to set peak season rates or special event pricing without direct DB access.

#### User Stories
- As owner, I want to set a peak-season rate of ₹7,500 for all Deluxe rooms from 15 Oct to 15 Jan so that holiday bookings charge the right price.
- As owner, I want to add a 20% weekend markup so Friday and Saturday nights are priced higher.
- As owner, I want to deactivate an old rate plan without deleting it.

#### Functional Requirements
- Page at `/admin/settings/rates` (or tab within Settings)
- Table of all rate plans: Name, Room Type, Base Rate, Valid From/To, Weekend Markup, Status (Active/Inactive)
- Add / Edit rate plan form:
  - Name (e.g., "Peak Season 2026")
  - Room Type (Deluxe / Premium / Family / All)
  - Base Rate (₹/night)
  - Extra Bed Rate (₹/night)
  - Valid From / Valid To date range
  - Weekend Markup (%)
  - Min Nights
  - Priority (higher = takes precedence when multiple plans overlap)
  - Active toggle
- Delete plan (with warning if it overlaps with future bookings)
- Preview: show effective rate for a selected date range

#### Route Plan
- `GET /api/admin/rate-plans`
- `POST /api/admin/rate-plans`
- `PATCH /api/admin/rate-plans/[id]`
- `DELETE /api/admin/rate-plans/[id]`

#### Schema Impact
`RatePlan` model already fully defined. No schema changes needed.

---

### F-06 Promo Code Manager

**Priority:** P1 — High  
**Effort:** Medium (1–2 days)

#### Purpose
The `Promotion` model exists in the schema and is applied during booking creation. There is no UI to create or manage promo codes. This prevents the owner from running direct-booking promotions without DB access.

#### User Stories
- As owner, I want to create a code SUMMER20 giving 20% off for bookings in June–July so that I can drive direct bookings during the lean season.
- As owner, I want to set a usage limit of 50 on a code so it cannot be overused.
- As owner, I want to see how many times each code has been used.

#### Functional Requirements
- Page at `/admin/settings/promos`
- Table: Code, Name, Type (%), Value, Valid Period, Used/Limit, Status
- Add / Edit form:
  - Code (uppercase, unique)
  - Name/label (internal)
  - Discount Type: Percentage or Flat Amount
  - Discount Value (%)
  - Max Discount Cap (for % type)
  - Valid From / Valid To
  - Min Nights
  - Usage Limit (blank = unlimited)
  - Active toggle
- Toggle active/inactive from the table row
- Delete (only if usedCount = 0)
- Clicking a code shows a list of bookings that used it

#### Route Plan
- `GET /api/admin/promos`
- `POST /api/admin/promos`
- `PATCH /api/admin/promos/[id]`
- `DELETE /api/admin/promos/[id]`

#### Schema Impact
`Promotion` model already fully defined. No schema changes needed.

---

### F-07 Occupancy & Revenue Reports

**Priority:** P1 — High  
**Effort:** Medium (2 days)

#### Purpose
The current Reconciliation page shows monthly revenue vs expenses. This feature adds a dedicated analytics view with occupancy rates, ADR (Average Daily Rate), RevPAR (Revenue Per Available Room), and booking source breakdown — the key metrics a hotel owner watches.

#### User Stories
- As owner, I want to see occupancy % by month for the last 12 months so that I can identify low-demand periods.
- As owner, I want to see what percentage of bookings come from the website vs OTAs so I can measure the cost of commissions.
- As owner, I want to compare this month's RevPAR to the same month last year.

#### Functional Requirements
- Page at `/admin/reports`
- Date range selector (default: last 12 months, presets: This Month, Last Month, This Year)
- KPI cards:
  - Occupancy Rate (%) = occupied room-nights / total room-nights available
  - ADR = total room revenue / occupied room-nights
  - RevPAR = total room revenue / total room-nights available
  - Total Bookings, Total Guests, Average Length of Stay
- Charts (using a lightweight charting lib or CSS bars):
  - Monthly occupancy % bar chart
  - Revenue by month line chart
  - Booking source pie/donut (website, booking.com, mmt, walkin, phone)
  - Room type contribution (Deluxe vs Premium vs Family revenue %)
- Export: download the report as CSV

#### Route Plan
- `GET /api/admin/reports?from=YYYY-MM-DD&to=YYYY-MM-DD`

#### Schema Impact
None. Queries `Booking` table with aggregations.

---

### F-08 Guest Profile Page

**Priority:** P1 — High  
**Effort:** Small–Medium (1–2 days)

#### Purpose
The current Guests page is a flat list. Clicking a guest should open a full profile showing all their stays, spending history, preferences, and ID details. This enables personalized service — the owner can greet returning guests by name and reference their previous stay preferences.

#### User Stories
- As staff, I want to click a guest and see all their previous bookings so I can give them a personalised welcome.
- As owner, I want to see the lifetime value of a guest (total revenue) and how many times they have stayed.
- As staff, I want to add internal notes to a guest record (e.g., "prefers quiet room, vegetarian").

#### Functional Requirements
- Route: `/admin/guests/[id]`
- Sections on the profile page:
  - **Summary** — Name, Phone, Email, ID Proof, City/State, Total Stays, Total Revenue, First Stay, Last Stay
  - **Booking History** — table of all bookings: dates, room, amount, status. Clickable to booking detail.
  - **Notes** — free-text internal notes field (editable, saved on blur)
  - **Edit** — inline edit for name, phone, email, address fields
- "Back to Guests" breadcrumb
- If guest has GSTIN, show it with a flag for B2B invoice

#### Route Plan
- `GET /api/admin/guests/[id]` — guest + bookings + invoices
- `PATCH /api/admin/guests/[id]` — update guest fields

#### Schema Impact
`Guest` model already has `notes` field. No schema changes needed.

---

### F-09 Bulk Guest Communication

**Priority:** P2 — Medium  
**Effort:** Medium (2 days)

#### Purpose
Allow the owner to send a WhatsApp message or email to a targeted group of guests — upcoming arrivals, past guests for re-engagement, or guests with pending balances.

#### User Stories
- As owner, I want to send a check-in reminder to all guests arriving tomorrow with the resort address and check-in time.
- As owner, I want to send a "monsoon offer" email to guests who stayed last year but haven't booked again.

#### Functional Requirements
- Page at `/admin/communications`
- Compose panel:
  - **To:** filter — Upcoming Arrivals (next N days), Checked-in Guests, Past Guests (date range), Manual (paste phone numbers)
  - **Channel:** Email (via Resend) or WhatsApp (message template via `NEXT_PUBLIC_WHATSAPP_NUMBER`)
  - **Subject** (email only)
  - **Message body** — plain text with merge tags: `{{guestName}}`, `{{checkIn}}`, `{{roomName}}`, `{{bookingNumber}}`
  - Preview with first recipient's data substituted
  - "Send to N guests" confirmation before sending
- Send log: table of past sends with channel, audience, date, count

#### Route Plan
- `GET /api/admin/communications/preview?filter=...` — returns recipient list
- `POST /api/admin/communications/send` — dispatches messages via Resend/WhatsApp

#### Schema Impact
New model required:

```prisma
model CommunicationLog {
  id         String   @id @default(cuid())
  channel    String   // email | whatsapp
  subject    String?
  body       String   @db.Text
  recipients Int
  sentBy     String   @map("sent_by")
  filter     String
  createdAt  DateTime @default(now()) @map("created_at")
  @@map("communication_log")
}
```

---

### F-10 Reviews Tracker

**Priority:** P2 — Medium  
**Effort:** Small (1 day)

#### Purpose
A simple internal table for tracking guest reviews posted on Google, Booking.com, TripAdvisor, etc. No external API integration — the owner manually logs reviews. Ensures no review goes unresponded to.

#### User Stories
- As owner, I want to paste a Google review link and mark whether I have responded so that nothing is missed.
- As owner, I want to see the average rating trend over time.

#### Functional Requirements
- Page at `/admin/reviews`
- Table: Platform, Guest Name, Rating (1–5), Review Snippet, Date Posted, Responded (Yes/No), Action
- Add review: Platform (Google/Booking.com/TripAdvisor/MMT/Other), Guest Name, Rating, Review text, Date, Review URL
- Toggle "Responded" checkbox per row
- Filter: platform, responded status, rating range
- KPI at top: Total Reviews, Avg Rating, % Responded

#### Route Plan
- `GET /api/admin/reviews`
- `POST /api/admin/reviews`
- `PATCH /api/admin/reviews/[id]`
- `DELETE /api/admin/reviews/[id]`

#### Schema Impact
New model required:

```prisma
model ReviewLog {
  id           String   @id @default(cuid())
  platform     String   // google | booking_com | tripadvisor | mmt | other
  guestName    String   @map("guest_name")
  rating       Int
  reviewText   String   @db.Text @map("review_text")
  reviewUrl    String?  @map("review_url")
  datePosted   DateTime @map("date_posted") @db.Date
  responded    Boolean  @default(false)
  respondedAt  DateTime? @map("responded_at")
  notes        String?  @db.Text
  createdAt    DateTime @default(now()) @map("created_at")
  @@map("review_log")
}
```

---

### F-11 Maintenance Flags Dashboard

**Priority:** P2 — Medium  
**Effort:** Small (< 1 day)

#### Purpose
`HousekeepingLog.maintenanceFlag` already exists and is set when housekeeping staff flag an issue. There is no dedicated view to see all open maintenance issues. The owner currently has to scan the full housekeeping log to find them.

#### User Stories
- As owner, I want to see a list of all rooms with open maintenance issues so I can prioritise repair work.
- As maintenance staff, I want to mark an issue as resolved so it disappears from the dashboard.

#### Functional Requirements
- Dedicated tab or card on the Dashboard and `/admin/housekeeping`
- Filtered view: `HousekeepingLog WHERE maintenanceFlag = true AND status != 'completed'`
- Table: Room, Issue description (notes), Flagged date, Assigned to, Days open
- Resolve button → sets `status = "completed"`, `completedAt = now()`
- Resolved items move to a "Resolved" tab (last 30 days)
- Badge on the Housekeeping sidebar nav showing count of open issues

#### Route Plan
- `GET /api/admin/housekeeping?maintenanceFlag=true` — extend existing endpoint
- `PATCH /api/admin/housekeeping/[id]` — extend existing endpoint

#### Schema Impact
None. Uses `HousekeepingLog.maintenanceFlag` (field already exists).

---

### F-12 Invoice PDF Download

**Priority:** P2 — Medium  
**Effort:** Medium (2 days)

#### Purpose
The `Invoice` model is fully defined and already stores all GST-compliant fields (hotel GSTIN, guest GSTIN, CGST/SGST amounts, line items). Currently there is no way to generate a PDF. The owner needs to provide tax invoices to corporate guests and for their own GST filing.

#### User Stories
- As owner, I want to click "Download PDF" on any invoice and get a formatted GST invoice so I can email it to the guest.
- As owner, I want to email the invoice directly from the admin portal without downloading first.

#### Functional Requirements
- "Download PDF" button on the Invoices list and on the booking detail page
- PDF format: standard Indian GST tax invoice layout
  - Hotel name, address, GSTIN
  - Invoice number, date
  - Guest name, address, GSTIN (if applicable)
  - Line items: Room type, nights, rate per night, amount
  - Discount line (if any)
  - Taxable amount
  - CGST @ X% + SGST @ X%
  - Total in figures and words
  - "Rio Casa" branding at top
- "Email to Guest" button → sends PDF via Resend to `booking.guestEmail`
- PDF URL stored in `Invoice.pdfUrl` after first generation (cached)

#### Route Plan
- `GET /api/admin/invoices/[id]/pdf` — returns PDF binary (Content-Type: application/pdf)
- `POST /api/admin/invoices/[id]/email` — emails PDF to guest

#### Schema Impact
None. `Invoice.pdfUrl` field already exists for caching the generated PDF URL.

#### Library
Use `@react-pdf/renderer` (React-based, no headless browser needed, works on Vercel serverless).

---

### F-13 Staff Shift Schedule

**Priority:** P3 — Low  
**Effort:** Medium (2 days)

#### Purpose
A simple weekly grid showing which staff member covers which shift at each station (Front Desk, Housekeeping, Kitchen). No payroll integration — purely a visual schedule for coordination.

#### User Stories
- As owner, I want to assign Ravi to Front Desk on Monday morning and Priya on Monday evening so that coverage is clear.
- As staff, I want to check my schedule for the week without calling the owner.

#### Functional Requirements
- Page at `/admin/settings/schedule`
- Weekly grid: rows = days of the week, columns = shift slots (Morning 7–3, Evening 3–11, Night 11–7)
- Each cell shows assigned staff name per station (Front Desk / Housekeeping / Kitchen)
- Navigate by week (prev/next)
- Click cell → assign/change staff member (dropdown of active Staff records)
- Print-friendly layout (CSS @media print)

#### Route Plan
- `GET /api/admin/shifts?weekStart=YYYY-MM-DD`
- `POST /api/admin/shifts` — create/update assignment
- `DELETE /api/admin/shifts/[id]`

#### Schema Impact
New model required:

```prisma
model ShiftAssignment {
  id         String   @id @default(cuid())
  date       DateTime @db.Date
  slot       String   // morning | evening | night
  station    String   // frontdesk | housekeeping | kitchen
  staffId    String   @map("staff_id")
  notes      String?
  createdAt  DateTime @default(now()) @map("created_at")

  staff Staff @relation(fields: [staffId], references: [id])
  @@unique([date, slot, station])
  @@map("shift_assignments")
}
```

---

## 4. Implementation Roadmap

### Phase 1 — Gap Closers (build this first; schema gaps that exist today)
| Feature | Why first |
|---|---|
| F-03 Blocked Dates Manager | Schema exists, no UI — bookings can't be properly blocked without this |
| F-02 Quick Check-in / Check-out | Fields exist, no UI — daily front-desk friction |
| F-11 Maintenance Flags Dashboard | Data exists, no view — owner is blind to open issues |

### Phase 2 — High-Value Operations
| Feature | Why |
|---|---|
| F-01 Booking Calendar | Highest daily-use feature in any PMS |
| F-05 Rate Plans Manager | Revenue impact — peak/off-peak pricing has no UI |
| F-06 Promo Code Manager | Marketing — direct booking promotions blocked without this |
| F-04 Night Audit Panel | End-of-day hygiene; function already written |

### Phase 3 — Analytics & Guest Relations
| Feature | Why |
|---|---|
| F-07 Occupancy & Revenue Reports | Owner insight into business performance |
| F-08 Guest Profile Page | Personalised service for returning guests |
| F-12 Invoice PDF Download | GST compliance; corporate guests need tax invoices |

### Phase 4 — Communication & Support Features
| Feature | Why |
|---|---|
| F-09 Bulk Guest Communication | Re-engagement + arrival reminders |
| F-10 Reviews Tracker | Reputation management |
| F-13 Staff Shift Schedule | Team coordination |

---

## 5. Schema Changes Required

| Feature | New Model | Fields to Add |
|---|---|---|
| F-03 Blocked Dates | — (exists) | — |
| F-05 Rate Plans | — (exists) | — |
| F-06 Promo Codes | — (exists) | — |
| F-09 Bulk Communication | `CommunicationLog` | channel, body, recipients, sentBy, filter |
| F-10 Reviews Tracker | `ReviewLog` | platform, guestName, rating, reviewText, reviewUrl, datePosted, responded |
| F-13 Shift Schedule | `ShiftAssignment` | date, slot, station, staffId — unique(date, slot, station) |

All other features (F-01, F-02, F-04, F-07, F-08, F-11, F-12) require no schema changes — they work with existing models.

**Migrations needed before Phase 4:**
```bash
npx prisma db push   # after adding CommunicationLog, ReviewLog, ShiftAssignment to schema.prisma
```
