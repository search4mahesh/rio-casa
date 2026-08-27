/**
 * No room in the property sleeps more than five, so a larger party takes
 * several — and one reservation has to hold all of them. These tests pin the
 * parts that are easy to get subtly wrong and expensive to notice later: the
 * lock covering every room, money that adds up to what Razorpay was charged,
 * and one promo redemption per party rather than one per room.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  executeRaw: vi.fn().mockResolvedValue(1),
  roomFindMany: vi.fn(),
  ratePlanFindFirst: vi.fn(),
  bookingFindMany: vi.fn(),
  bookingAggregate: vi.fn(),
  guestUpdate: vi.fn(),
  auditCreate: vi.fn(),
  transaction: vi.fn(),
  txBookingCreate: vi.fn(),
  txGroupCreate: vi.fn(),
  txQueryRaw: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: h.queryRaw,
    $executeRaw: h.executeRaw,
    $transaction: h.transaction,
    room: { findMany: h.roomFindMany },
    ratePlan: { findFirst: h.ratePlanFindFirst },
    booking: { findMany: h.bookingFindMany, aggregate: h.bookingAggregate, updateMany: vi.fn() },
    guest: { update: h.guestUpdate },
    roomStatus: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    auditLog: { create: h.auditCreate },
  },
}));

vi.mock("@/lib/razorpay", () => ({ fetchOrderPaymentState: vi.fn() }));

import { createGroupBooking } from "@/lib/booking-service";

const family = {
  id: "r_family", name: "Family Room", roomType: "family", pricePerNight: 7500,
  extraBed: true, extraBedRate: 1000, isActive: true,
};
const standard = {
  id: "r_std", name: "Standard Room", roomType: "standard", pricePerNight: 4500,
  extraBed: true, extraBedRate: 1000, isActive: true,
};

/** One weeknight, well in the future so the past-date guard stays out of it. */
const STAY = {
  checkIn: new Date("2099-09-01T00:00:00.000Z"),
  checkOut: new Date("2099-09-02T00:00:00.000Z"),
  guestName: "Test Guest",
  guestEmail: "test@example.com",
  guestPhone: "9876543210",
  adults: 5,
};

beforeEach(() => {
  vi.clearAllMocks();

  h.bookingFindMany.mockResolvedValue([]); // no stale holds

  // `priceRooms` refuses when the rows it gets back do not match the ids it
  // asked for, so the mock has to honour the `where` rather than returning the
  // whole property every time.
  setRooms([family, standard]);
  h.ratePlanFindFirst.mockResolvedValue(null); // price off room.pricePerNight
  h.bookingAggregate.mockResolvedValue({ _count: { _all: 1 }, _sum: { totalAmount: 0 } });
  h.guestUpdate.mockResolvedValue({});
  h.auditCreate.mockResolvedValue({});

  h.queryRaw.mockImplementation((strings: TemplateStringsArray) => {
    const sql = Array.from(strings).join("");
    if (sql.includes("UPDATE promotions")) {
      return Promise.resolve([
        { id: "promo1", discount_type: "flat", discount_value: "1000", max_discount: null },
      ]);
    }
    if (sql.includes("daily_counters")) return Promise.resolve([{ last_seq: 7 }]);
    return Promise.resolve([]);
  });

  h.txGroupCreate.mockResolvedValue({ id: "grp1", groupNumber: "BK-20990901-007" });
  h.txQueryRaw.mockResolvedValue([{ conflict: null, blocked: false }]);
  h.txBookingCreate.mockImplementation((args: { data: Record<string, unknown> }) =>
    Promise.resolve({
      ...args.data,
      id: `bk_${args.data.bookingNumber}`,
      room: args.data.roomId === family.id ? family : standard,
    })
  );

  h.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      guest: { findFirst: vi.fn().mockResolvedValue({ id: "g1" }), create: vi.fn() },
      $queryRaw: h.txQueryRaw,
      bookingGroup: { create: h.txGroupCreate },
      booking: { create: h.txBookingCreate },
    })
  );
});

/** Point `room.findMany` at a property, filtering on the ids each call asks for. */
function setRooms(rooms: Array<Record<string, unknown>>) {
  h.roomFindMany.mockImplementation((args?: { where?: { id?: { in?: string[] } } }) => {
    const wanted = args?.where?.id?.in;
    return Promise.resolve(wanted ? rooms.filter((r) => wanted.includes(r.id as string)) : rooms);
  });
}

/** Reassemble a Prisma tagged-template call into inspectable SQL + values. */
function rawCall(call: unknown[]) {
  const [strings, ...values] = call as [TemplateStringsArray, ...unknown[]];
  return { sql: Array.from(strings).join("?"), values };
}

describe("createGroupBooking — the party's rooms", () => {
  it("writes one booking row per room, all under one group", async () => {
    const result = await createGroupBooking({
      ...STAY,
      rooms: [{ roomId: family.id, extraBed: true }, { roomId: standard.id }],
    });

    expect(result.success).toBe(true);
    expect(h.txGroupCreate).toHaveBeenCalledOnce();
    expect(h.txBookingCreate).toHaveBeenCalledTimes(2);
    expect(result.group!.bookings).toHaveLength(2);

    // Every child points at the group, so nothing downstream has to guess.
    for (const call of h.txBookingCreate.mock.calls) {
      expect(call[0].data.groupId).toBe("grp1");
    }
  });

  it("hangs the room numbers off the group's, rather than burning one each", async () => {
    await createGroupBooking({
      ...STAY,
      rooms: [{ roomId: family.id }, { roomId: standard.id }],
    });

    const numbers = h.txBookingCreate.mock.calls.map((c) => c[0].data.bookingNumber);
    expect(numbers).toEqual(["BK-20990901-007/1", "BK-20990901-007/2"]);

    // One allocation for the party — a second would leave a gap in the day's
    // sequence for every extra room.
    const counterCalls = h.queryRaw.mock.calls
      .map(rawCall)
      .filter((c) => c.sql.includes("daily_counters"));
    expect(counterCalls).toHaveLength(1);
  });

  it("leaves a single-room booking on the plain number", async () => {
    await createGroupBooking({ ...STAY, adults: 2, rooms: [{ roomId: standard.id }] });

    expect(h.txBookingCreate.mock.calls[0][0].data.bookingNumber).toBe("BK-20990901-007");
  });

  it("locks every room in one call, so two parties queue instead of deadlocking", async () => {
    await createGroupBooking({
      ...STAY,
      rooms: [{ roomId: family.id }, { roomId: standard.id }],
    });

    const lock = h.txQueryRaw.mock.calls.map(rawCall).find((c) => c.sql.includes("FOR UPDATE"));
    expect(lock).toBeDefined();
    expect(lock!.sql).toContain("ORDER BY id");
    expect(lock!.values[0]).toEqual([family.id, standard.id]);
  });

  it("refuses a party that names the same room twice", async () => {
    // It would pass the conflict re-check — nothing is committed yet — and then
    // die on the exclusion constraint at commit, reaching the guest as
    // "something went wrong".
    const result = await createGroupBooking({
      ...STAY,
      rooms: [{ roomId: standard.id }, { roomId: standard.id }],
    });

    expect(result.success).toBe(false);
    expect(h.txBookingCreate).not.toHaveBeenCalled();
  });

  it("sweeps stale holds on every room it is about to take", async () => {
    await createGroupBooking({
      ...STAY,
      rooms: [{ roomId: family.id }, { roomId: standard.id }],
    });

    // Scoped to this party's rooms — a guest must not be blocked by a dead hold
    // on the second room any more than on the first.
    expect(h.bookingFindMany.mock.calls[0][0].where.roomId).toEqual({
      in: [family.id, standard.id],
    });
  });
});

describe("createGroupBooking — money", () => {
  it("charges the extra bed from the room when no rate plan applies", async () => {
    await createGroupBooking({ ...STAY, rooms: [{ roomId: family.id, extraBed: true }] });

    const written = h.txBookingCreate.mock.calls[0][0].data;
    expect(written.extraBed).toBe(true);
    // (7500 + 1000) × 1 night, GST 18% because the nightly rate clears ₹7,500.
    expect(written.totalAmount).toBe(10030);
  });

  it("keeps the GST slab per room rather than on the party total", async () => {
    // Two ₹4,500 rooms sum to ₹9,000 — above the slab boundary — but each room
    // is a ₹4,500 tariff, so both stay at 12%.
    setRooms([standard, { ...standard, id: "r_std2" }]);

    const result = await createGroupBooking({
      ...STAY,
      adults: 4,
      rooms: [{ roomId: standard.id }, { roomId: "r_std2" }],
    });

    for (const call of h.txBookingCreate.mock.calls) {
      expect(call[0].data.totalAmount).toBe(5040); // 4500 × 1.12
    }
    expect(result.group!.totalAmount).toBe(10080);
  });

  it("splits one promo across the rooms so the parts sum to the whole", async () => {
    const result = await createGroupBooking({
      ...STAY,
      rooms: [{ roomId: family.id }, { roomId: standard.id }],
      promoCode: "FLAT1000",
    });

    const written = h.txBookingCreate.mock.calls.map((c) => c[0].data);
    const shares = written.map((w) => w.discountAmount as number);

    // ₹1,000 off a ₹12,000 subtotal, proportional to 7500 / 4500.
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1000, 6);
    expect(result.group!.discountAmount).toBe(1000);
    expect(
      written.reduce((sum, w) => sum + (w.totalAmount as number), 0)
    ).toBeCloseTo(result.group!.totalAmount, 6);
  });

  it("claims one redemption for the party, not one per room", async () => {
    await createGroupBooking({
      ...STAY,
      rooms: [{ roomId: family.id }, { roomId: standard.id }],
      promoCode: "FLAT1000",
    });

    // A code capped at 50 uses must not be exhausted by seventeen families.
    const claims = h.queryRaw.mock.calls
      .map(rawCall)
      .filter((c) => c.sql.includes("UPDATE promotions"));
    expect(claims).toHaveLength(1);
  });

  it("puts the whole party's headcount on the group", async () => {
    const result = await createGroupBooking({
      ...STAY,
      adults: 5,
      rooms: [{ roomId: family.id }, { roomId: standard.id }],
    });

    expect(result.success).toBe(true);
    expect(h.txGroupCreate.mock.calls[0][0].data.adults).toBe(5);
  });
});

describe("createGroupBooking — refusals", () => {
  it("refuses an empty selection rather than committing an empty group", async () => {
    const result = await createGroupBooking({ ...STAY, rooms: [] });
    expect(result.success).toBe(false);
    expect(h.transaction).not.toHaveBeenCalled();
  });

  it("names the party, not 'this room', when one of several is taken", async () => {
    h.txQueryRaw.mockResolvedValue([{ conflict: "BK-OTHER-001", blocked: false }]);

    const result = await createGroupBooking({
      ...STAY,
      rooms: [{ roomId: family.id }, { roomId: standard.id }],
    });

    expect(result.errorCode).toBe("ROOM_NOT_AVAILABLE");
    expect(result.error).toContain("One of those rooms");
  });

  it("hands the promo claim back when the rooms turn out to be gone", async () => {
    h.txQueryRaw.mockResolvedValue([{ conflict: "BK-OTHER-001", blocked: false }]);

    await createGroupBooking({
      ...STAY,
      rooms: [{ roomId: family.id }, { roomId: standard.id }],
      promoCode: "FLAT1000",
    });

    // Otherwise a capped code is burnt down by everyone who loses a race.
    const release = h.executeRaw.mock.calls
      .map(rawCall)
      .find((c) => c.sql.includes("used_count"));
    expect(release).toBeDefined();
  });
});
