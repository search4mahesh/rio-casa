import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * `GET /api/booking/promo/preview` — what a code would be worth on this stay.
 *
 * The property that matters is that it **spends nothing**. Claiming a promo is
 * an `UPDATE` that consumes a redemption, and a price preview that consumed
 * one would burn the guest's own code before they had booked with it. This
 * route calls `previewPromo` (a SELECT), never `claimPromo`.
 */

vi.mock("@/lib/booking-service", () => ({
  priceRooms: vi.fn(),
  previewPromo: vi.fn(),
  resolveSelection: vi.fn(),
  splitDiscountAcrossRooms: vi.fn(),
  // Present so an accidental import would be visible as a call, not a crash.
  claimPromo: vi.fn(),
}));

import { GET } from "@/app/api/booking/promo/preview/route";
import * as bookingService from "@/lib/booking-service";

const priceRooms = vi.mocked(bookingService.priceRooms);
const previewPromo = vi.mocked(bookingService.previewPromo);
const resolveSelection = vi.mocked(bookingService.resolveSelection);
const splitDiscount = vi.mocked(bookingService.splitDiscountAcrossRooms);

function get(qs: string) {
  return new NextRequest(`http://localhost/api/booking/promo/preview?${qs}`);
}

const PRICING = {
  nights: 2,
  subtotal: 9000,
  lines: [{ subtotal: 9000, cgstAmount: 540, sgstAmount: 540 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  priceRooms.mockResolvedValue(PRICING as never);
  previewPromo.mockResolvedValue({ valid: true, discount: 900 } as never);
  splitDiscount.mockReturnValue({
    lines: [{ subtotal: 8100, cgstAmount: 486, sgstAmount: 486 }],
    total: 9072,
  } as never);
});

describe("GET /api/booking/promo/preview", () => {
  const base = "code=MONSOON10&checkIn=2026-12-01&checkOut=2026-12-03&roomId=r1";

  it("prices a valid code without claiming it", async () => {
    const res = await GET(get(base));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.valid).toBe(true);
    expect(body.data.discountAmount).toBe(900);
    expect(body.data.totalAmount).toBe(9072);

    // The whole point: a preview must not spend a redemption.
    expect(previewPromo).toHaveBeenCalledTimes(1);
    expect(bookingService.claimPromo).not.toHaveBeenCalled();
  });

  it("reports an invalid code as a reason, not an error status", async () => {
    previewPromo.mockResolvedValue({ valid: false, reason: "This code has expired" } as never);

    const res = await GET(get(base));

    // A guest mistyping a code is not a failure of the request.
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.valid).toBe(false);
    expect(body.data.reason).toBe("This code has expired");
  });

  it("trims the code, so a previewed discount claims under the same string", async () => {
    await GET(get("code=%20%20MONSOON10%20%20&checkIn=2026-12-01&checkOut=2026-12-03&roomId=r1"));

    // B-43: previewPromo trimmed and claimPromo did not, so a previewed
    // discount could fail the whole booking.
    expect(previewPromo.mock.calls[0][0]).toBe("MONSOON10");
  });

  it("splits one discount across a party's rooms rather than repeating it", async () => {
    resolveSelection.mockResolvedValue({
      rooms: [{ roomId: "r1", extraBed: false }, { roomId: "r2", extraBed: true }],
      allocation: { capacity: 5 },
    } as never);

    await GET(get("code=X&checkIn=2026-12-01&checkOut=2026-12-03&rooms=standard:2&guests=5"));

    // One code is worth one discount for the whole party, split by the same
    // function the booking uses.
    expect(splitDiscount).toHaveBeenCalledTimes(1);
    expect(splitDiscount.mock.calls[0][1]).toBe(900);
  });

  it("refuses a stay that ends before it starts", async () => {
    const res = await GET(get("code=X&checkIn=2026-12-05&checkOut=2026-12-01&roomId=r1"));

    expect(res.status).toBe(400);
    expect(priceRooms).not.toHaveBeenCalled();
  });

  it("refuses a request naming neither a room nor a selection", async () => {
    const res = await GET(get("code=X&checkIn=2026-12-01&checkOut=2026-12-03"));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/roomId or rooms/i);
  });

  // B-45: a bare regex accepts 2026-02-30, which `dateOnly` then throws on —
  // an empty 500 where a 400 belongs.
  it("rejects a date that does not exist with a 400, not a 500", async () => {
    const res = await GET(get("code=X&checkIn=2026-02-30&checkOut=2026-03-02&roomId=r1"));

    expect(res.status).toBe(400);
    expect(typeof (await res.json()).error).toBe("string");
  });

  it("404s when the room does not exist", async () => {
    priceRooms.mockResolvedValue(null as never);

    expect((await GET(get(base))).status).toBe(404);
  });

  it("409s when the party's rooms are no longer free", async () => {
    resolveSelection.mockResolvedValue(null as never);

    const res = await GET(get("code=X&checkIn=2026-12-01&checkOut=2026-12-03&rooms=standard:2&guests=4"));
    expect(res.status).toBe(409);
  });

  it("refuses a selection that cannot sleep the party", async () => {
    resolveSelection.mockResolvedValue({
      rooms: [{ roomId: "r1", extraBed: false }],
      allocation: { capacity: 2 },
    } as never);

    const res = await GET(get("code=X&checkIn=2026-12-01&checkOut=2026-12-03&rooms=standard:1&guests=5"));

    expect(res.status).toBe(400);
    expect(priceRooms).not.toHaveBeenCalled();
  });
});
