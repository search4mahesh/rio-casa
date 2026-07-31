import { PrismaClient, Prisma } from "@prisma/client";

// ─────────────────────────────────────────────────────────────
// Generate realistic bookings around today so the calendar and
// dashboard have something to show.
//
// Existing demo data sat months in the past, which left the
// calendar legitimately empty and looking broken.
//
// Bookings are laid out per room as a non-overlapping sequence —
// stay, gap, stay — so they can never trip the database exclusion
// constraint that makes double booking impossible.
//
//   npx tsx prisma/seed-bookings.ts            # fill empty slots
//   npx tsx prisma/seed-bookings.ts --reset    # clear window first
//   npx tsx prisma/seed-bookings.ts --days 120 # widen the window
// ─────────────────────────────────────────────────────────────

const prisma = new PrismaClient();

const RESET = process.argv.includes("--reset");
const argValue = (name: string, fallback: number) => {
  const i = process.argv.indexOf(`--${name}`);
  const v = i === -1 ? NaN : Number(process.argv[i + 1]);
  return Number.isFinite(v) ? v : fallback;
};

const DAYS_BACK = argValue("back", 21);
const DAYS_FORWARD = argValue("days", 75);

const SOURCES = ["website", "walkin", "phone", "booking_com", "mmt"] as const;

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(d: Date, n: number) {
  const o = new Date(d);
  o.setDate(o.getDate() + n);
  return o;
}
function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick<T>(arr: readonly T[]): T {
  return arr[randomInt(0, arr.length - 1)];
}

/** Mirrors the GST split in lib/booking-service.ts: 12% up to ₹7,500/night, else 18%. */
function priceStay(nightlyRate: number, nights: number) {
  const subtotal = nightlyRate * nights;
  const gstRate = subtotal / nights <= 7500 ? 6 : 9;
  const cgstAmount = Math.round(subtotal * gstRate) / 100;
  const sgstAmount = cgstAmount;
  return { subtotal, cgstAmount, sgstAmount, totalAmount: subtotal + cgstAmount + sgstAmount };
}

async function main() {
  const today = startOfDay(new Date());
  const windowStart = addDays(today, -DAYS_BACK);
  const windowEnd = addDays(today, DAYS_FORWARD);

  console.log(`🗓️  Seeding bookings ${windowStart.toDateString()} → ${windowEnd.toDateString()}`);
  console.log(`    today is ${today.toDateString()}\n`);

  const rooms = await prisma.room.findMany({ where: { isActive: true }, orderBy: { roomNumber: "asc" } });
  const guests = await prisma.guest.findMany();

  if (!rooms.length) throw new Error("No active rooms. Run `npx tsx prisma/seed-rooms.ts` first.");
  if (!guests.length) throw new Error("No guests. Run `npx tsx prisma/seed-demo.ts` first.");

  if (RESET) {
    const doomed = await prisma.booking.findMany({
      where: { checkIn: { lt: windowEnd }, checkOut: { gt: windowStart } },
      select: { id: true },
    });
    const ids = doomed.map((b) => b.id);
    if (ids.length) {
      await prisma.payment.deleteMany({ where: { bookingId: { in: ids } } });
      await prisma.invoice.deleteMany({ where: { bookingId: { in: ids } } });
      await prisma.channelSyncLog.deleteMany({ where: { bookingId: { in: ids } } });
      await prisma.roomStatus.updateMany({
        where: { currentBookingId: { in: ids } },
        data: { currentBookingId: null, currentGuestId: null, occupancy: "vacant" },
      });
      await prisma.booking.deleteMany({ where: { id: { in: ids } } });
    }
    console.log(`  ✓ cleared ${ids.length} existing booking(s) in the window\n`);
  }

  let created = 0;
  let seq = 0;
  const summary: Record<string, number> = {};

  for (const room of rooms) {
    // Walk the window laying down stay/gap/stay so nothing overlaps.
    let cursor = addDays(windowStart, randomInt(0, 4));

    while (cursor < windowEnd) {
      const nights = randomInt(1, 4);
      const checkIn = new Date(cursor);
      const checkOut = addDays(checkIn, nights);
      if (checkOut > windowEnd) break;

      // Skip if anything already occupies these dates (non-destructive mode).
      const clash = await prisma.booking.findFirst({
        where: {
          roomId: room.id,
          status: { notIn: ["cancelled"] },
          checkIn: { lt: checkOut },
          checkOut: { gt: checkIn },
        },
        select: { id: true },
      });

      if (!clash) {
        // Status follows the dates, so the board tells a coherent story.
        let status: string;
        if (checkOut <= today) status = Math.random() < 0.18 ? "no_show" : "checked_out";
        else if (checkIn <= today) status = "checked_in";
        else status = "confirmed";

        const guest = pick(guests);
        const adults = Math.min(room.maxGuests, randomInt(1, 2));
        const children = room.maxGuests >= 4 && Math.random() < 0.5 ? randomInt(1, 2) : 0;
        const { cgstAmount, sgstAmount, totalAmount } = priceStay(room.pricePerNight, nights);

        const paymentStatus =
          status === "no_show" ? "pending" : status === "confirmed" ? (Math.random() < 0.6 ? "paid" : "pending") : "paid";

        seq += 1;
        await prisma.booking.create({
          data: {
            bookingNumber: `BK-${checkIn.toISOString().slice(0, 10).replace(/-/g, "")}-${String(seq).padStart(3, "0")}`,
            guestId: guest.id,
            guestName: `${guest.firstName} ${guest.lastName}`,
            guestEmail: guest.email ?? `${guest.firstName.toLowerCase()}@example.com`,
            guestPhone: guest.phone,
            roomId: room.id,
            checkIn,
            checkOut,
            nights,
            adults,
            children,
            totalAmount,
            cgstAmount,
            sgstAmount,
            status,
            paymentStatus,
            source: pick(SOURCES),
            actualCheckin: status === "checked_in" || status === "checked_out" ? checkIn : null,
            actualCheckout: status === "checked_out" ? checkOut : null,
          },
        });

        created += 1;
        summary[status] = (summary[status] ?? 0) + 1;
      }

      // Gap before the next stay — leaves visible gaps in the calendar.
      cursor = addDays(checkOut, randomInt(1, 6));
    }
  }

  console.log(`  ✓ created ${created} booking(s) across ${rooms.length} rooms`);
  for (const [status, n] of Object.entries(summary).sort()) console.log(`      ${status.padEnd(12)} ${n}`);

  const occupiedToday = await prisma.booking.count({
    where: { checkIn: { lte: today }, checkOut: { gt: today }, status: { notIn: ["cancelled", "no_show"] } },
  });
  console.log(`\n  In-house today: ${occupiedToday}/${rooms.length} rooms`);
}

main()
  .catch((e) => {
    if (e instanceof Prisma.PrismaClientKnownRequestError) console.error("Prisma error:", e.code, e.message);
    else console.error("FAILED:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
