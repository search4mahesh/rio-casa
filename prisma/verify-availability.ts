import "dotenv/config";
import {
  checkAvailability,
  createGroupBooking,
  getAvailableRooms,
  resolveSelection,
} from "../lib/booking-service";
import {
  largestSingleRoom,
  roomSleeps,
  suggestAllocation,
  toCategories,
  totalCapacity,
} from "../lib/room-capacity";
import { addDays, dateOnly, toDayString } from "../lib/dates";
import { makeScriptClient } from "./script-client";

/**
 * Availability check for the public booking flow.
 *
 *   npx tsx prisma/verify-availability.ts
 *
 * Answers two questions the unit tests cannot, because they mock the database:
 *
 *  1. **A booked room is never offered again.** Not for the same dates, not for
 *     a range that overlaps by one night, not to a party small enough to fit in
 *     it — and it comes back the moment the booking is cancelled. The two
 *     half-open edges are checked explicitly: a stay ending on the day another
 *     begins does *not* hide the room.
 *  2. **Every party size gets an honest answer.** A party larger than any one
 *     room is offered a combination rather than the empty state that used to
 *     claim the resort was full (B-57), and a party larger than the property
 *     is told no rather than being sold beds that do not exist.
 *
 * Writes to whatever DATABASE_URL points at, in a date range far enough out
 * that it cannot collide with real inventory. Everything it creates is removed
 * at the end, including on failure.
 */

const db = makeScriptClient();
const TAG = "availtest@example.com";

// Far future, so real bookings and blocked dates cannot interfere either way.
const D = (n: number) => addDays(dateOnly("2028-11-05"), n);
const CI = D(0);
const CO = D(3);

let passed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failures.push(label + (detail ? ` - ${detail}` : ""));
    console.log(`  FAIL ${label}${detail ? ` - ${detail}` : ""}`);
  }
}

function section(title: string) {
  console.log(`\n-- ${title} ${"-".repeat(Math.max(0, 58 - title.length))}`);
}

const ids = (rooms: Array<{ id: string }>) => new Set(rooms.map((r) => r.id));
const name = (r: { roomNumber: string | null; roomType: string }) =>
  `#${r.roomNumber ?? "?"} (${r.roomType})`;

/** Free rooms for a window, exactly as the availability endpoint lists them. */
async function free(from: Date, to: Date) {
  return getAvailableRooms(from, to, 1);
}

async function book(roomId: string, adults: number) {
  return createGroupBooking({
    rooms: [{ roomId }],
    checkIn: CI,
    checkOut: CO,
    adults,
    guestName: "Avail Test",
    guestEmail: TAG,
    guestPhone: "9000000001",
    source: "website",
  });
}

async function main() {
  const active = await db.room.count({ where: { isActive: true } });

  section("Baseline - the test window is clean");
  const baseline = await free(CI, CO);
  console.log(
    `  ${toDayString(CI)} -> ${toDayString(CO)}: ${baseline.length} of ${active} active rooms free`
  );
  check(
    "every active room is free in the test window",
    baseline.length === active,
    `${baseline.length} free vs ${active} active - pick another window`
  );
  if (baseline.length !== active) return;

  const cats = toCategories(baseline);
  const cap = totalCapacity(cats);
  const biggest = largestSingleRoom(cats);
  console.log(`\n  categories the wizard would show:`);
  for (const c of cats) {
    console.log(
      `    ${c.roomType.padEnd(10)} x${c.count}  sleeps ${roomSleeps(c)} ` +
        `(${c.maxGuests}${c.extraBed ? ` + bed Rs${c.extraBedRate}` : ""})  from Rs${c.pricePerNight}`
    );
  }
  console.log(`  property sleeps ${cap}; largest single room sleeps ${biggest}`);

  // ───────────────────────────────────────────────────────────────────
  section(`Party sizes 1..${cap + 2} - everyone gets an honest answer`);
  console.log("  guests  rooms  beds  sleeps   per night   plan");
  for (let g = 1; g <= cap + 2; g++) {
    const plan = suggestAllocation(cats, g);
    const fits = g <= cap;

    if (!plan) {
      console.log(`  ${String(g).padStart(6)}       -     -       -           -   no combination`);
      check(
        `party of ${g} is refused only because the property cannot sleep it`,
        !fits,
        `property sleeps ${cap}`
      );
      continue;
    }

    const shape = plan.lines
      .filter((l) => l.rooms > 0)
      .map((l) => `${l.rooms}x${l.roomType}${l.extraBeds ? ` +${l.extraBeds} bed` : ""}`)
      .join(", ");
    console.log(
      `  ${String(g).padStart(6)}  ${String(plan.totalRooms).padStart(5)} ` +
        `${String(plan.totalExtraBeds).padStart(5)} ${String(plan.capacity).padStart(7)} ` +
        `${("Rs" + (plan.roomsNightly + plan.bedsNightly)).padStart(11)}   ${shape}`
    );

    check(`party of ${g}: the plan sleeps them`, plan.capacity >= g, `plan sleeps ${plan.capacity}`);
    check(
      `party of ${g}: the plan fits the free inventory`,
      plan.lines.every((l) => {
        const c = cats.find((x) => x.roomType === l.roomType)!;
        return l.rooms <= c.count && l.extraBeds <= l.rooms && (l.extraBeds === 0 || c.extraBed);
      })
    );
    check(`party of ${g}: not refused while the property can sleep them`, fits);
  }

  // The regression this whole feature exists for.
  const six = suggestAllocation(cats, 6);
  check(
    "a party of 6 - larger than any single room - is not told the resort is full",
    six !== null && six.capacity >= 6
  );
  check(
    "a party of 4 gets one family room, not two standards",
    suggestAllocation(cats, 4)?.totalRooms === 1
  );
  check(`a party of ${cap + 1} is told no`, suggestAllocation(cats, cap + 1) === null);

  // ───────────────────────────────────────────────────────────────────
  section("One booked room disappears from the listing");
  const family = baseline.find((r) => r.roomType === "family") ?? baseline[0];
  const booked = await book(family.id, 2);
  check(`booking ${name(family)} succeeds`, booked.success, booked.error ?? "");
  if (!booked.success) return;
  console.log(`  booked ${name(family)} as ${booked.group!.groupNumber}`);

  const afterOne = await free(CI, CO);
  check("the booked room is gone from the listing", !ids(afterOne).has(family.id));
  check(
    "exactly one room left the listing",
    afterOne.length === baseline.length - 1,
    `${afterOne.length} free`
  );

  const single = await checkAvailability(family.id, CI, CO);
  check("the single-room check agrees it is taken", single.available === false);
  check(
    "the single-room check names the conflicting booking",
    single.conflictingBooking === booked.group!.bookings[0].bookingNumber
  );

  const catsAfter = toCategories(afterOne);
  check(
    "the booked room's category no longer counts it",
    (catsAfter.find((c) => c.roomType === family.roomType)?.count ?? 0) ===
      cats.find((c) => c.roomType === family.roomType)!.count - 1
  );

  const fiveNow = suggestAllocation(catsAfter, 5);
  check(
    "a party of 5 is re-planned around the booked room, not into it",
    fiveNow !== null &&
      fiveNow.capacity >= 5 &&
      (fiveNow.lines.find((l) => l.roomType === family.roomType)?.rooms ?? 0) === 0
  );

  const resolved = await resolveSelection(CI, CO, { [family.roomType]: 1 }, 2);
  check(
    "resolveSelection will not hand back the booked room",
    resolved === null || resolved.rooms.every((r) => r.roomId !== family.id)
  );

  // ───────────────────────────────────────────────────────────────────
  section("Overlapping windows - half-open, so touching stays are fine");
  const windows: Array<[string, number, number, boolean]> = [
    ["exact same nights      ", 0, 3, false],
    ["strictly inside        ", 1, 2, false],
    ["straddles the arrival  ", -2, 1, false],
    ["straddles the departure", 2, 5, false],
    ["envelopes the stay     ", -2, 5, false],
    ["ends on the arrival day", -3, 0, true],
    ["starts on departure day", 3, 6, true],
    ["entirely before        ", -5, -2, true],
    ["entirely after         ", 5, 8, true],
  ];
  for (const [w, from, to, visible] of windows) {
    const list = await free(D(from), D(to));
    const shown = ids(list).has(family.id);
    console.log(
      `  ${w} ${toDayString(D(from))}->${toDayString(D(to))}  ` +
        `${shown ? "offered" : "hidden "}  (${list.length} free)`
    );
    check(`${w.trim()}: room is ${visible ? "offered" : "hidden"}`, shown === visible);
  }

  // ───────────────────────────────────────────────────────────────────
  section("Filling the property one room at a time");
  const bookedIds = new Set<string>([family.id]);
  let remaining = await free(CI, CO);
  while (remaining.length > 0) {
    const room = remaining[0];
    const res = await book(room.id, 1);
    if (!res.success) {
      check(`booking ${name(room)} succeeds`, false, res.error ?? "");
      break;
    }
    bookedIds.add(room.id);

    const now = await free(CI, CO);
    const nowIds = ids(now);
    const leaked = [...bookedIds].filter((id) => nowIds.has(id));
    console.log(
      `  booked ${name(room).padEnd(18)} -> ${now.length} free, ` +
        `sleeps ${totalCapacity(toCategories(now))}`
    );
    check(
      `no booked room is still offered after ${bookedIds.size} bookings`,
      leaked.length === 0,
      `${leaked.length} leaked`
    );
    check(
      `the listing shrank by exactly one (${remaining.length} -> ${now.length})`,
      now.length === remaining.length - 1
    );
    remaining = now;
  }

  const full = await free(CI, CO);
  check("a full property offers nothing", full.length === 0, `${full.length} still offered`);
  check(
    "a full property suggests nothing to a party of 1",
    suggestAllocation(toCategories(full), 1) === null
  );
  check(
    "a full property resolves no selection",
    (await resolveSelection(CI, CO, { standard: 1 }, 1)) === null
  );
  check(
    "the single-room check agrees the property is full",
    (await checkAvailability(family.id, CI, CO)).available === false
  );

  // The rooms are only taken for *these* nights.
  const later = await free(D(5), D(8));
  check(
    "a full window does not hide the rooms on other dates",
    later.length === active,
    `${later.length} free the following week`
  );

  // ───────────────────────────────────────────────────────────────────
  section("Cancelled, no-show and failed bookings give the room back");
  const testBookings = await db.booking.findMany({
    where: { guestEmail: TAG, checkIn: CI },
    select: { id: true, roomId: true, bookingNumber: true },
    orderBy: { bookingNumber: "asc" },
  });

  const cases: Array<[string, Record<string, string>]> = [
    ["cancelled", { status: "cancelled" }],
    ["no_show", { status: "no_show" }],
    ["failed payment", { paymentStatus: "failed" }],
  ];
  for (let i = 0; i < cases.length; i++) {
    const [what, patch] = cases[i];
    const b = testBookings[i];
    await db.booking.update({ where: { id: b.id }, data: patch });
    const list = await free(CI, CO);
    check(`a ${what} booking returns its room to the listing`, ids(list).has(b.roomId!));
    check(`only that room came back (${what})`, list.length === i + 1, `${list.length} free`);
  }

  // ───────────────────────────────────────────────────────────────────
  section("Blocked dates hide rooms too");
  const someRoom = (await free(CI, CO))[0];
  const roomBlock = await db.blockedDate.create({
    data: { roomId: someRoom.id, blockDate: D(1), reason: "availability verification" },
  });
  check(
    "a room blocked for one night inside the stay is hidden",
    !ids(await free(CI, CO)).has(someRoom.id)
  );
  check(
    "the same room is still offered for a window outside the block",
    ids(await free(D(5), D(8))).has(someRoom.id)
  );
  await db.blockedDate.delete({ where: { id: roomBlock.id } });

  const allBlock = await db.blockedDate.create({
    data: { roomId: null, blockDate: D(1), reason: "availability verification" },
  });
  check("a property-wide block hides every room", (await free(CI, CO)).length === 0);
  check(
    "a property-wide block does not leak into other dates",
    (await free(D(5), D(8))).length === active
  );
  await db.blockedDate.delete({ where: { id: allBlock.id } });
  check("removing the block restores the listing", (await free(CI, CO)).length === 3);

  // ───────────────────────────────────────────────────────────────────
  section("Past and inverted windows are refused, not answered");
  check("check-out before check-in offers nothing", (await free(D(3), D(0))).length === 0);
  check(
    "a window in the past offers nothing",
    (await free(dateOnly("2020-01-01"), dateOnly("2020-01-03"))).length === 0
  );
}

async function cleanup() {
  const groups = await db.bookingGroup.findMany({
    where: { bookings: { some: { guestEmail: TAG } } },
    select: { id: true },
  });
  const bookings = await db.booking.deleteMany({ where: { guestEmail: TAG } });
  await db.bookingGroup.deleteMany({ where: { id: { in: groups.map((g) => g.id) } } });
  await db.auditLog.deleteMany({
    where: { entityType: "booking_group", entityId: { in: groups.map((g) => g.id) } },
  });
  await db.blockedDate.deleteMany({ where: { reason: "availability verification" } });
  await db.guest.deleteMany({ where: { email: TAG } });
  console.log(`\ncleanup: removed ${bookings.count} booking(s), ${groups.length} group(s)`);
}

main()
  .catch((e) => {
    console.error("FATAL", e);
    failures.push(`threw: ${String(e).slice(0, 200)}`);
  })
  .finally(async () => {
    await cleanup().catch((e) => console.error("cleanup failed:", e));
    console.log(`\n${passed} passed, ${failures.length} failed`);
    for (const f of failures) console.log(`  FAIL ${f}`);
    if (failures.length > 0) process.exitCode = 1;
    else console.log("\nPASS - booked rooms stay hidden; every party size gets an honest answer");
    await db.$disconnect();
  });
