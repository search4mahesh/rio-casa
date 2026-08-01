import { makeScriptClient } from "./script-client";
import { ROOMS } from "./seed-rooms";

// ─────────────────────────────────────────────────────────────
// Reshape existing room data to the canonical inventory without
// losing bookings.
//
// The database drifted to 12 rooms with three duplicated room
// numbers (101, 201, 202), and — importantly — the duplicates are
// the rows that carry the real booking history, not the seeded
// ones. So this does not simply delete extras:
//
//   • per room number, the row with the most bookings survives
//   • dependents are moved onto the survivor only when the move
//     cannot create an overlapping stay
//   • a loser that still has history is deactivated, never deleted
//   • survivors are normalised to the canonical name/slug/type
//
// Dry run by default. Pass --apply to write.
//   npx tsx prisma/normalize-rooms.ts
//   npx tsx prisma/normalize-rooms.ts --apply
// ─────────────────────────────────────────────────────────────

const prisma = makeScriptClient();
const APPLY = process.argv.includes("--apply");

type Plan = { action: string; detail: string };
const plan: Plan[] = [];
const record = (action: string, detail: string) => plan.push({ action, detail });

async function dependentCounts(roomId: string) {
  const [bookings, blocked, status, hk] = await Promise.all([
    prisma.booking.count({ where: { roomId } }),
    prisma.blockedDate.count({ where: { roomId } }),
    prisma.roomStatus.count({ where: { roomId } }),
    prisma.housekeepingLog.count({ where: { roomId } }),
  ]);
  return { bookings, blocked, status, hk, total: bookings + blocked + status + hk };
}

/** True when every booking on `fromId` can move to `toId` without overlapping. */
async function canMoveBookings(fromId: string, toId: string) {
  const moving = await prisma.booking.findMany({
    where: { roomId: fromId },
    select: { id: true, bookingNumber: true, checkIn: true, checkOut: true, status: true },
  });
  const blockers: string[] = [];
  for (const b of moving) {
    if (b.status === "cancelled") continue;
    const clash = await prisma.booking.findFirst({
      where: {
        roomId: toId,
        status: { notIn: ["cancelled"] },
        checkIn: { lt: b.checkOut },
        checkOut: { gt: b.checkIn },
      },
      select: { bookingNumber: true },
    });
    if (clash) blockers.push(`${b.bookingNumber} overlaps ${clash.bookingNumber}`);
  }
  return { ok: blockers.length === 0, blockers, count: moving.length };
}

async function main() {
  console.log(APPLY ? "🔧 APPLYING changes\n" : "🔍 DRY RUN — nothing will be written (pass --apply to write)\n");

  const canonicalByNumber = new Map(ROOMS.map((r) => [r.roomNumber, r]));
  const all = await prisma.room.findMany({ orderBy: { createdAt: "asc" } });

  const groups = new Map<string, typeof all>();
  for (const r of all) {
    const key = r.roomNumber ?? "(none)";
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  console.log(`Found ${all.length} rooms across ${groups.size} room numbers.\n`);

  for (const [roomNumber, rows] of [...groups.entries()].sort()) {
    const canonical = canonicalByNumber.get(roomNumber);

    if (!canonical) {
      for (const r of rows) {
        const dep = await dependentCounts(r.id);
        if (dep.total > 0) {
          record("DEACTIVATE", `${roomNumber} ${r.slug} — not in canonical list but has ${dep.bookings} bookings`);
          if (APPLY) await prisma.room.update({ where: { id: r.id }, data: { isActive: false } });
        } else {
          record("DELETE", `${roomNumber} ${r.slug} — not in canonical list, no history`);
          if (APPLY) await prisma.room.delete({ where: { id: r.id } });
        }
      }
      continue;
    }

    // Survivor = most bookings, then oldest.
    const withDeps = await Promise.all(rows.map(async (r) => ({ room: r, dep: await dependentCounts(r.id) })));
    withDeps.sort((a, b) =>
      b.dep.bookings - a.dep.bookings || a.room.createdAt.getTime() - b.room.createdAt.getTime()
    );
    const survivor = withDeps[0].room;
    const losers = withDeps.slice(1);

    for (const { room: loser, dep } of losers) {
      if (dep.total === 0) {
        record("DELETE", `${roomNumber} ${loser.slug} — duplicate, no history`);
        if (APPLY) await prisma.room.delete({ where: { id: loser.id } });
        continue;
      }

      const move = await canMoveBookings(loser.id, survivor.id);
      if (move.ok) {
        record(
          "MERGE",
          `${roomNumber} ${loser.slug} → ${survivor.slug} — moving ${dep.bookings} booking(s), ` +
            `${dep.blocked} blocked, ${dep.hk} housekeeping, then deleting`
        );
        if (APPLY) {
          await prisma.$transaction([
            prisma.booking.updateMany({ where: { roomId: loser.id }, data: { roomId: survivor.id } }),
            prisma.blockedDate.updateMany({ where: { roomId: loser.id }, data: { roomId: survivor.id } }),
            prisma.housekeepingLog.updateMany({ where: { roomId: loser.id }, data: { roomId: survivor.id } }),
            prisma.roomStatus.deleteMany({ where: { roomId: loser.id } }),
          ]);
          await prisma.room.delete({ where: { id: loser.id } });
        }
      } else {
        record(
          "DEACTIVATE",
          `${roomNumber} ${loser.slug} — cannot merge (${move.blockers.join("; ")}), hiding instead`
        );
        if (APPLY) await prisma.room.update({ where: { id: loser.id }, data: { isActive: false } });
      }
    }

    // Normalise the survivor onto the canonical spec.
    const diffs: string[] = [];
    if (survivor.name !== canonical.name) diffs.push(`name ${survivor.name} → ${canonical.name}`);
    if (survivor.slug !== canonical.slug) diffs.push(`slug ${survivor.slug} → ${canonical.slug}`);
    if (survivor.roomType !== canonical.roomType) diffs.push(`type ${survivor.roomType} → ${canonical.roomType}`);
    if (survivor.maxGuests !== canonical.maxGuests) diffs.push(`pax ${survivor.maxGuests} → ${canonical.maxGuests}`);
    if (survivor.pricePerNight !== canonical.pricePerNight) diffs.push(`₹${survivor.pricePerNight} → ₹${canonical.pricePerNight}`);
    if (survivor.floor !== canonical.floor) diffs.push(`floor ${survivor.floor} → ${canonical.floor}`);
    if (!survivor.isActive) diffs.push("reactivate");

    if (diffs.length) {
      record("NORMALIZE", `${roomNumber} ${survivor.slug} — ${diffs.join(", ")}`);
      if (APPLY) {
        await prisma.room.update({
          where: { id: survivor.id },
          data: {
            name: canonical.name,
            slug: canonical.slug,
            roomType: canonical.roomType,
            floor: canonical.floor,
            maxGuests: canonical.maxGuests,
            extraBed: canonical.extraBed,
            pricePerNight: canonical.pricePerNight,
            baseRate: canonical.baseRate,
            amenities: canonical.amenities,
            descriptionEn: canonical.descriptionEn,
            descriptionHi: canonical.descriptionHi,
            descriptionMr: canonical.descriptionMr,
            isActive: true,
          },
        });
      }
    } else {
      record("OK", `${roomNumber} ${survivor.slug} — already canonical`);
    }
  }

  // Create any canonical room that does not exist at all.
  for (const c of ROOMS) {
    if (!groups.has(c.roomNumber)) {
      record("CREATE", `${c.roomNumber} ${c.slug} — missing`);
      if (APPLY) {
        await prisma.room.create({
          data: { ...c, images: [], photos: [], status: "available", isActive: true },
        });
      }
    }
  }

  console.log("Plan:");
  const width = Math.max(...plan.map((p) => p.action.length));
  for (const p of plan) console.log(`  ${p.action.padEnd(width)}  ${p.detail}`);

  const finalRooms = await prisma.room.findMany({
    where: { isActive: true },
    orderBy: { roomNumber: "asc" },
    select: { roomNumber: true, roomType: true, pricePerNight: true, maxGuests: true },
  });
  console.log(`\n${APPLY ? "Result" : "Current"} active inventory (${finalRooms.length} rooms):`);
  for (const r of finalRooms) {
    console.log(`  ${(r.roomNumber ?? "--").padEnd(4)} ${r.roomType.padEnd(9)} pax=${r.maxGuests} ₹${r.pricePerNight}`);
  }

  if (!APPLY) console.log("\n🔍 Dry run only. Re-run with --apply to write these changes.");
}

main()
  .catch((e) => { console.error("FAILED:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
