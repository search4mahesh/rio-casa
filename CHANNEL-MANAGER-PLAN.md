# Channel Manager — current state and plan

**Status: shelved. Rio Casa does not use a channel manager.** Every booking
arrives through the website, the front desk, or the phone.

This file exists because `CLAUDE.md` points at it to explain why
`/api/cron/pull-ota` is deliberately unscheduled, and because the code still
carries a half-built eZee Centrix integration that reads as production wiring
if you meet it without context.

---

## What is actually in the repository

Three pieces of eZee Centrix scaffolding, none of which run:

| Piece | Where | Runs? |
|---|---|---|
| `syncWithChannelManager(bookingId)` | `lib/booking-service.ts` | Called after payment verification — **returns immediately** unless `EZEE_API_URL` is set |
| `pullOTABookings()` | `lib/booking-service.ts` | Only from the route below — **returns immediately** unless `EZEE_API_URL` is set |
| `GET /api/cron/pull-ota` | `app/api/cron/pull-ota/route.ts` | Reachable, but **absent from `vercel.json`**, so nothing invokes it |
| `ChannelSyncLog` | `prisma/schema.prisma` | Table exists; only written by `syncWithChannelManager` |

Both functions guard on `process.env.EZEE_API_URL` and return early when it is
unset, which is why nothing has ever fired in production.

## Why `/api/cron/pull-ota` must stay unscheduled

`.env` ships a **placeholder** `EZEE_API_URL="https://api.ezeecentrix.com"` and
`EZEE_API_KEY="your_ezee_api_key"`. If those were copied into a real
environment, the guard would pass and the route would start making
authenticated HTTP requests at a third party on a schedule, with credentials
that are not ours.

Worse, `pullOTABookings()` does not merely read. It calls `createBooking()` for
anything the remote returns, so a scheduled run against an unexpected response
would **write real bookings that hold real rooms**.

Leave it out of `vercel.json`. If you want to exercise it, call it by hand with
the `CRON_SECRET` bearer token.

## If the property ever does adopt one

Nothing here is a recommendation of eZee specifically — it was the vendor the
original scaffolding targeted, and it was not chosen. Treat the existing code
as a sketch, not a foundation. Before switching any of it on:

1. **Availability is not a push.** `syncWithChannelManager` pushes a single
   room-type block after each booking. That is the naive design that oversells:
   a push that fails leaves the channel selling a room we have taken.
   Reconciliation has to be a periodic full-inventory sync, not per-booking
   deltas, with the local calendar as the source of truth.

2. **Inbound bookings must not bypass the guards.** `pullOTABookings()` calls
   `createBooking()`, which is right — that is the path holding
   `guardRoomAvailability`, the exclusion constraint, and the booking-number
   allocator. Any new import path must go through it too, not write `bookings`
   rows directly. See "Keep the critical section short" in `CLAUDE.md`.

3. **OTA bookings are `pending` on purpose.** The guest already paid the
   channel. `expireStalePaymentHolds()` is scoped to `source: "website"` for
   exactly this reason — widening it would cancel real stays. Anything that
   changes hold expiry has to keep that scoping.

4. **`getAvailableRooms` matching is by room type**, and `pullOTABookings`
   picks the first free room of the requested type. That is fine for a small
   property and wrong for one with meaningful room-type inventory; revisit it
   before relying on it.

5. **Decide what happens when no room is free.** Today it logs
   `[ota-pull] No room available … handle manually` and continues. An
   overbooking that only exists in a log line will be missed.

## Removing it instead

If the decision is that no channel manager is coming, delete together:

- `syncWithChannelManager` and `pullOTABookings` (`lib/booking-service.ts`)
- its call site in `app/api/payment/verify/route.ts`
- `app/api/cron/pull-ota/route.ts`
- `EZEE_API_URL` / `EZEE_API_KEY` from `.env`
- the `ChannelSyncLog` model and its `Booking.channelSyncLogs` relation, in a
  migration

Keep the `source` column on `Booking` regardless — the reports break down
revenue by it, and walk-in/phone/website remain meaningful without any OTA.
