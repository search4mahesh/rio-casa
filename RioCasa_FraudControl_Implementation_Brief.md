# Implementation Brief — Occupancy Integrity & Fraud Control
## Hotel Rio Casa · PMS Lite + Website Integration

**Document type:** Handoff spec for an AI coding agent with access to the Rio Casa PMS Lite and website codebase.
**Audience:** A Claude instance that has the repository but none of the conversation history that produced this plan.
**Author context:** Produced with the property owner (Mahesh), who is a software professional and will review and modify this. Treat him as a peer engineer, not an end user.

---

## 0. How to use this document

Read all of it before writing code. Sections 1–3 are context you cannot recover from the repo. Section 9 lists decisions you must **ask about rather than assume** — several of them change the schema.

Do not implement everything at once. Section 8 defines a phase order that is deliberate; phases 3 and 5 are separated for a reason stated there.

Where this document conflicts with what you find in the codebase, the codebase wins on facts (table names, existing patterns) and this document wins on intent. Flag the conflict rather than silently reconciling it.

---

## 1. Property and system context

**Hotel Rio Casa** — boutique resort on Panchgani Road near Lingmala Waterfall, Mahabaleshwar, Maharashtra. Opened 7 May 2026.

- 9 rooms currently: 101–105 (ground), 201–204 (upper). Rooms 201 and 204 have bathtubs; 204 has a private balcony. All rooms have AC.
- Expansion in progress: 6 additional rooms in a **separate adjacent structure**, plus a swimming pool. Design for 15 rooms across two buildings, not 9 in one.
- Rooms are sold heavily through **booking agents** (named individuals who bring walk-in and phone business) and OTAs (Booking.com, MakeMyTrip). Agent names in current use: Nilesh (highest volume), Shankar, Suraj, Sachin, Master, Shubham.
- Food is run by a **third-party restaurant operator** on an adjacent property (Ruchira Garden Restaurant). F&B revenue is **out of scope** — do not model it.
- **The owner is remote much of the time.** This is the entire reason the system exists. Every control must work without anyone trustworthy being physically present.

**Stack (existing / planned):**
- Next.js (App Router), PostgreSQL, Prisma ORM
- Booking overlap prevention already implemented via `btree_gist` exclusion constraints; serializable transactions used for race handling
- Razorpay for payments
- eZee Centrix as channel manager (chosen specifically for API access)
- WhatsApp alerting already wired for booking-conflict detection — **reuse this channel, do not build a second one**

**Existing spreadsheets** (source of truth today, being migrated into PMS Lite):
- `Hotel_Rio_Casa_Tracker.xlsx` — Daily Bookings, Daily Summary, Dashboard, Agent Performance, Room Performance
- `Mahabaleshwar_Pricing_Breakeven_Model.xlsx` — Breakeven Model, Pricing Calendar, Booking Tracker, Occupancy Grid

---

## 2. Objective and non-goals

### Objective

Detect any material occupancy-or-revenue discrepancy **within 24–48 hours**, using measurements that no single person can edit.

### Explicitly NOT the objective

Making fraud impossible. It is not achievable and pursuing it produces expensive, brittle systems that people route around. The design target is *reliable detection*, which is what actually deters.

State this plainly to the owner if he pushes for guarantees.

### Non-goals for this build

- Guest-facing keyless-entry marketing features
- Video surveillance integration
- Biometric anything
- F&B / restaurant reconciliation
- Payroll or attendance (housekeeping credentials are an access control, **not** a time-clock — do not let scope creep here)

---

## 3. Threat model

Design against these six. If a proposed feature doesn't reduce one of them, it's out of scope.

| # | Vector | Mechanism | Primary detection |
|---|---|---|---|
| T1 | **Unsold occupancy** | Room let out, never entered into PMS, cash pocketed | Lock event with no matching booking; electricity; linen |
| T2 | **Phantom booking** | Booking entered for room A, guest actually placed in room B, difference pocketed | Booking with zero guest unlocks |
| T3 | **Rate skimming** | Guest charged ₹5,000, ₹3,500 recorded | Payment vs. rate card; guest-side confirmation message |
| T4 | **Ghost discount** | Fictitious discount applied, difference retained | Discount authorisation trail |
| T5 | **Silent stay extension** | Guest stays extra night, not recorded | Post-checkout unlock events |
| T6 | **Credential leakage** | Housekeeping PIN shared or reused after hours | Per-person PINs, daily rotation, time windows |

**T1 and T3 are the highest-value targets.** T1 because it's the classic remote-owner loss; T3 because cash makes it invisible.

### The most important non-software control

**Remove cash from staff hands.** Per-room UPI/QR settling directly to the owner's account, advance or arrival payment, no pay-at-checkout-in-cash default. This single change eliminates most of T1 and T3 at the root.

Software cannot fix a cash process. Build the reconciliation anyway — but if the owner asks what to do first, the answer is the payment flow, not the locks.

---

## 4. The four-source model

Fraud surfaces as **disagreement between independent measurements**. Four sources, no two of which can be altered by the same person:

1. **Lock events** — room-nights physically occupied
2. **Payments** — Razorpay + UPI settlement, owner-controlled account
3. **Electricity** — per-room sub-meter reading, monthly
4. **Linen** — sets issued from counted stock vs. rooms sold

PMS bookings are the fifth signal but are *editable by staff*, so they are the thing being verified, not a verifier.

**Rule: any two sources agreeing against one disagreeing is a signal.** A single-source anomaly is usually noise.

---

## 5. Data model

Extend the existing schema. Do not fork it. Adapt names to existing repo conventions where they differ.

### 5.1 Smart lock core

```prisma
model Lock {
  id            String   @id @default(cuid())
  roomId        String   @unique
  room          Room     @relation(fields: [roomId], references: [id])

  vendorLockId  String   @unique
  gatewayId     String?
  building      String                     // "main" | "annexe" — 2 buildings from expansion
  timezone      String   @default("Asia/Kolkata")

  batteryPct    Int?
  clockDriftSec Int?                       // lock clock minus server clock
  lastSyncAt    DateTime?

  credentials   Credential[]
  events        LockEvent[]
}

enum CredentialType { GUEST HOUSEKEEPING MAINTENANCE OWNER }
enum CredentialState { PENDING ACTIVE REVOKED EXPIRED FAILED }

model Credential {
  id              String          @id @default(cuid())
  lockId          String
  lock            Lock            @relation(fields: [lockId], references: [id])

  type            CredentialType
  state           CredentialState @default(PENDING)

  pinHash         String                   // argon2id + per-row salt. NEVER plaintext.
  pinLast2        String                   // support only: "ends in 47"
  vendorPassKeyId String?  @unique         // required to revoke — persist or you cannot kill it

  validFrom       DateTime
  validUntil      DateTime

  bookingId       String?
  booking         Booking? @relation(fields: [bookingId], references: [id])
  staffId         String?
  staff           Staff?   @relation(fields: [staffId], references: [id])

  issuedById      String
  issuedVia       String                   // "booking_confirm" | "roster_job" | "manual_override"

  createdAt       DateTime @default(now())
  revokedAt       DateTime?
  revokeReason    String?

  events          LockEvent[]

  @@index([lockId, validFrom, validUntil])
  @@index([bookingId])
  @@index([state])
}

enum EventKind { UNLOCK_PIN UNLOCK_APP UNLOCK_MECHANICAL LOCK TAMPER WRONG_PIN LOW_BATTERY }

enum Verdict {
  MATCHED_GUEST MATCHED_HOUSEKEEPING MATCHED_OWNER
  HK_OUT_OF_WINDOW UNSOLD_OCCUPANCY POST_CHECKOUT_ENTRY
  UNKNOWN_CREDENTIAL UNVERIFIED
}

model LockEvent {
  id            String    @id @default(cuid())
  lockId        String
  lock          Lock      @relation(fields: [lockId], references: [id])

  vendorEventId String    @unique          // idempotency key
  kind          EventKind
  occurredAt    DateTime                   // drift-corrected
  ingestedAt    DateTime  @default(now())

  credentialId  String?
  credential    Credential? @relation(fields: [credentialId], references: [id])

  verdict       Verdict?
  reviewedAt    DateTime?
  reviewNote    String?

  @@index([lockId, occurredAt])
  @@index([verdict, occurredAt])
}
```

### 5.2 Corroborating sources

```prisma
model MeterReading {
  id          String   @id @default(cuid())
  roomId      String
  room        Room     @relation(fields: [roomId], references: [id])
  readingDate DateTime @db.Date
  units       Decimal  @db.Decimal(10,2)   // cumulative kWh
  photoUrl    String?                      // photo of meter face — makes falsification harder
  recordedBy  String
  createdAt   DateTime @default(now())

  @@unique([roomId, readingDate])
}

model LinenIssue {
  id          String   @id @default(cuid())
  issueDate   DateTime @db.Date
  setsIssued  Int
  setsReturned Int?
  issuedTo    String
  note        String?

  @@unique([issueDate])
}

model ReconciliationFlag {
  id          String   @id @default(cuid())
  kind        String                       // "UNSOLD_OCCUPANCY" | "PHANTOM_BOOKING" | ...
  severity    String                       // "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
  periodStart DateTime
  periodEnd   DateTime

  roomId      String?
  bookingId   String?
  agentId     String?
  lockEventId String?

  detail      Json                         // evidence payload for the digest
  status      String   @default("OPEN")    // OPEN | ACKNOWLEDGED | RESOLVED | FALSE_POSITIVE
  resolvedBy  String?
  resolvedAt  DateTime?
  resolution  String?

  createdAt   DateTime @default(now())

  @@index([status, severity, createdAt])
}
```

`ReconciliationFlag.status` matters more than it looks. Flags that are never closed become noise, and noise is how this system dies. Build the resolution UI in the same phase as the flags themselves.

---

## 6. Behavioural specification

### 6.1 Guest credential

- Issued on `booking.status → CONFIRMED`. Never manually.
- `validFrom = checkIn − 2h`, `validUntil = checkOut + 1h` (grace windows are policy; keep uniform and state them in the confirmation message)
- 6-digit, crypto RNG. Reject sequential, 4+ repeated digits, and any PIN currently `ACTIVE` on the same lock (collision breaks attribution)
- Vendor push failure: retry ×3 with backoff → `FAILED` → WhatsApp the owner
- Room reassignment: **revoke then reissue inside one transaction**. Never mutate. A guest holding valid PINs to two rooms is a resale collision waiting to happen.
- Cancellation / early checkout: revoke immediately
- Pre-generate the next 48h of credentials so an internet outage doesn't block check-ins

### 6.2 Housekeeping credential

- **Per person, not shared.** A shared code makes T1 untraceable.
- Nightly cron 03:00 IST: revoke yesterday's, issue today's, window 07:30–18:00
- Staff termination: revoke all credentials on all locks synchronously; queue if a gateway is offline and mark the lock `pendingRevocation` until confirmed
- Do not widen the window for convenience. Use a short, owner-approved `MAINTENANCE` credential instead.

### 6.3 Event ingestion

- Poll every 15 min per gateway; request a 30-min overlap window (locks buffer events); upsert on `vendorEventId`
- Correct `occurredAt` by `clockDriftSec` — uncorrected drift puts near-midnight entries on the wrong business day
- Resync lock clocks each sweep; alert if `|drift| > 120s`
- Update `batteryPct` and `lastSyncAt` on every sweep

### 6.4 Classification

```ts
function classify(ev: LockEvent, booking: Booking | null): Verdict | null {
  if (ev.kind !== 'UNLOCK_PIN') return null;
  const c = ev.credential;
  if (!c) return 'UNVERIFIED';

  switch (c.type) {
    case 'OWNER': return 'MATCHED_OWNER';
    case 'HOUSEKEEPING':
    case 'MAINTENANCE':
      return withinWindow(ev.occurredAt, c) ? 'MATCHED_HOUSEKEEPING' : 'HK_OUT_OF_WINDOW';
    case 'GUEST':
      if (!booking) return 'UNSOLD_OCCUPANCY';           // T1
      if (ev.occurredAt > booking.checkOut) return 'POST_CHECKOUT_ENTRY';  // T5
      return 'MATCHED_GUEST';
  }
  return 'UNKNOWN_CREDENTIAL';
}
```

Plus the absence check, run nightly on bookings ending today:

```ts
if (await guestUnlockCount(booking) === 0) flag('PHANTOM_BOOKING', booking);  // T2
```

### 6.5 Monthly cross-source reconciliation

```
per room, per month:
  lock_nights     = distinct room-nights with ≥1 MATCHED_GUEST unlock
  pms_nights      = booked nights from PMS
  kwh_delta       = MeterReading month-end − month-start

  if lock_nights > pms_nights            → flag UNSOLD_OCCUPANCY (HIGH)
  if pms_nights  > lock_nights + 2       → flag PHANTOM_BOOKING pattern (MEDIUM)
  if kwh_delta > threshold && pms_nights == 0 → flag UNMETERED_USE (CRITICAL)

per month, property-wide:
  if linen_sets_issued > rooms_sold * 1.15 → flag LINEN_VARIANCE (MEDIUM)

per agent, per month:
  compute (lock_nights − pms_nights) grouped by booking agent
  persistent positive gap on one agent → flag AGENT_VARIANCE (HIGH)
```

On the agent check: **frame it as exposure, not accusation.** High-volume agents will show more absolute variance simply through volume — normalise by booking count before flagging, and require the pattern to persist across two months.

### 6.6 Alerting

Reuse the existing WhatsApp channel. Two tiers only.

| Rule | Tier |
|---|---|
| `UNSOLD_OCCUPANCY` (live lock event) | Immediate |
| `HK_OUT_OF_WINDOW` after 20:00 | Immediate |
| ≥5 `WRONG_PIN` in 10 min | Immediate |
| `UNMETERED_USE` | Immediate |
| `PHANTOM_BOOKING`, `POST_CHECKOUT_ENTRY`, variance flags | Daily digest 09:00 IST |
| Battery, gateway staleness | Weekly digest |

**Immediate-tier target: fewer than ~3 per month.** If it fires more, the owner stops reading it and the entire system becomes theatre. Tune aggressively toward the digest.

---

## 7. Integration points

| Surface | Change |
|---|---|
| `POST /api/bookings` (confirm) | Emit `issueGuestCredential` job |
| Booking cancel / modify | Emit `revokeCredential` / revoke+reissue |
| eZee Centrix inbound webhook | OTA bookings must trigger the same issuance path — do not create a second path |
| Website booking confirmation | Include check-in window and PIN-delivery expectation copy |
| WhatsApp sender | New message templates; reuse transport |
| Admin dashboard | New "Integrity" view: open flags, resolution workflow, lock health |
| Razorpay webhook | Persist payment events for the payment-vs-rate cross-check (T3) |
| Meter/linen entry | Simple mobile-friendly form, photo upload for meter readings |

**Idempotency:** issuance and revocation jobs must be safely re-runnable. Key on `bookingId + type`.

---

## 8. Build phases

| Phase | Deliverable | Acceptance |
|---|---|---|
| 0 | Payment flow: per-room UPI/QR, advance/arrival collection, cash as flagged exception | A month of bookings with zero unapproved cash |
| 1 | Lock/Credential/LockEvent schema + vendor client (issue/revoke/list) | Unit tests pass against a vendor sandbox or mock |
| 2 | Guest issuance + revocation, **one pilot room, two weeks** | Zero lockouts; every booking has exactly one live credential |
| 3 | Event polling + `classify()` + **daily digest only, no alerts** | Digest runs 14 consecutive days; owner has reviewed baseline |
| 4 | Housekeeping rotation cron | Zero out-of-window entries after one week of staff briefing |
| 5 | Immediate-tier alerts + flag resolution UI | Immediate alerts < 3 in first month |
| 6 | Meter + linen capture, monthly reconciliation job | First monthly report reconciles against the existing tracker |
| 7 | Roll to all rooms incl. annexe; agent variance reporting | Two clean monthly cycles |

**Phases 3 and 5 are separated deliberately.** Run the classifier silently first. Real-world entry patterns will not match anyone's expectations, and that discovery belongs in a digest, not in a 2am alert.

---

## 9. Decisions you must ask about — do not assume

1. **Lock vendor and SKU.** This spec assumes a TTLock-class device with offline-valid time-bound passcodes and a cloud API. Verify the actual endpoints, passcode types, and rate limits against current vendor documentation — versioned APIs change and any endpoint names recalled from memory are unreliable.
2. **Does the SKU report mechanical key use as an event?** Most do not. Determines how much weight `UNVERIFIED` carries.
3. **Free egress:** thumb-turn must open from inside without a PIN, always. Fire NOC requirement. Confirm on the specific SKU before hardware is ordered.
4. **Are room doors on an open corridor?** Driving monsoon rain on keypads is the top real-world failure mode in this location. May require IP65 or weather shields.
5. **Door thickness and backset per room.** Not returnable once drilled.
6. **Sub-meter feasibility** — whether per-room metering is practical given existing wiring, and whether the annexe is on the same connection.
7. **Grace window policy** — confirm ±2h/+1h with the owner; it drives desk arguments, not code.
8. **Agent variance reporting** — confirm the owner wants per-agent breakdowns before building them. This is a relationship question, not a technical one.
9. **Data retention** for lock events, and whether guest entry logs raise any privacy obligation worth documenting.

---

## 10. Constraints — things not to do

- **Never store plaintext PINs.** Resend = re-fetch from vendor or regenerate.
- **Never allow manual PIN creation** by anyone but the owner. This is the entire control; a "just this once" admin override destroys it.
- Lock the vendor's mobile admin app to a single owner account. Not shared with reception.
- **Do not treat housekeeping credentials as attendance data.** Different purpose, different consent, and it will poison staff cooperation.
- Do not build a second alerting channel.
- Do not surface raw flags to staff-facing screens — flags go to the owner only, and the resolution workflow is his.
- **Do not present any of this as making fraud impossible.** It makes undetected fraud unlikely. That distinction should survive into any copy you write.

---

## 11. The part that isn't code

Worth saying to the owner, because no amount of implementation quality substitutes for it:

Detection deters only if people know it exists and believe consequences follow. The controls should be stated openly to staff — not hidden. And the first small discrepancy has to draw a quiet, immediate response. A ₹2,000 variance handled promptly prevents the ₹50,000 one. If the first incident passes without consequence, every control described in this document becomes decoration.

Also: a mechanical master key stays in a sealed, signed envelope at reception. Every seal break gets logged and reconciled against lock events. That is the one entry path the system cannot see, and pretending otherwise is worse than accounting for it.
