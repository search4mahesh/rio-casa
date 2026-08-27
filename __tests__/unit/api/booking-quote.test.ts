/**
 * The wizard used to compute `pricePerNight × nights` client-side and label it
 * "Total Amount". The server prices through `quoteStay` → `applyGst`, adding
 * 12% or 18% GST and any weekend markup, so the guest approved one number and
 * Razorpay opened for another. This endpoint is where the summary screen now
 * gets its figures — it has to agree with what the booking will actually cost.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// The route prices through `priceRooms`, which reads the rooms with `findMany`
// — a party takes several, and asking for them one at a time would be a pool
// connection each.
const { mockRoomFindMany, mockRatePlanFindFirst } = vi.hoisted(() => ({
  mockRoomFindMany: vi.fn(),
  mockRatePlanFindFirst: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    room: { findMany: mockRoomFindMany },
    ratePlan: { findFirst: mockRatePlanFindFirst },
  },
}));

vi.mock("@/lib/razorpay", () => ({
  fetchOrderPaymentState: vi.fn(),
}));

import { GET } from "@/app/api/booking/quote/route";

function get(params: Record<string, string>) {
  const url = new URL("http://localhost/api/booking/quote");
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url.toString());
}

const room = {
  id: "r1",
  name: "Deluxe Room",
  roomType: "deluxe",
  pricePerNight: 5000,
  isActive: true,
  extraBed: true,
  // The room's own tariff, used when no rate plan covers the stay. Selecting a
  // room without it prices every rollaway at ₹0 (B-57).
  extraBedRate: 1200,
};

beforeEach(() => {
  mockRoomFindMany.mockReset().mockResolvedValue([room]);
  mockRatePlanFindFirst.mockReset().mockResolvedValue(null);
});

describe("GET /api/booking/quote", () => {
  it("returns a total that includes GST, not the bare room rate", async () => {
    // Mon 17 → Wed 19 Aug 2026: two weeknights, no rate plan.
    const res = await GET(get({ roomId: "r1", checkIn: "2026-08-17", checkOut: "2026-08-19" }));
    expect(res.status).toBe(200);

    const { data } = await res.json();
    expect(data.nights).toBe(2);
    expect(data.subtotal).toBe(10000);
    // avg nightly 5000 ≤ 7500 → 12% (CGST 6 + SGST 6)
    expect(data.cgstAmount).toBe(600);
    expect(data.sgstAmount).toBe(600);
    expect(data.taxAmount).toBe(1200);
    expect(data.totalAmount).toBe(11200);

    // The bug in one assertion: the old client-side figure was the subtotal.
    expect(data.totalAmount).not.toBe(data.subtotal);
  });

  it("applies the 18% slab above ₹7,500 a night", async () => {
    mockRoomFindMany.mockResolvedValueOnce([{ ...room, pricePerNight: 9000 }]);

    const res = await GET(get({ roomId: "r1", checkIn: "2026-08-17", checkOut: "2026-08-18" }));
    const { data } = await res.json();

    expect(data.subtotal).toBe(9000);
    expect(data.cgstAmount).toBe(810);
    expect(data.totalAmount).toBe(10620);
  });

  it("includes the rate plan's weekend markup", async () => {
    mockRatePlanFindFirst.mockResolvedValueOnce({
      id: "rp1",
      baseRate: 5000,
      extraBedRate: 800,
      weekendMarkup: 20,
      priority: 1,
    });

    // Fri 21 → Sun 23 Aug 2026: Friday and Saturday nights, both marked up.
    const res = await GET(get({ roomId: "r1", checkIn: "2026-08-21", checkOut: "2026-08-23" }));
    const { data } = await res.json();

    expect(data.nights).toBe(2);
    expect(data.subtotal).toBe(12000); // 5000 × 1.2 × 2
  });

  it("charges the extra bed from the rate plan when asked", async () => {
    mockRatePlanFindFirst.mockResolvedValueOnce({
      id: "rp1",
      baseRate: 5000,
      extraBedRate: 800,
      weekendMarkup: 0,
      priority: 1,
    });

    const res = await GET(
      get({ roomId: "r1", checkIn: "2026-08-17", checkOut: "2026-08-18", extraBed: "true" })
    );
    const { data } = await res.json();

    expect(data.subtotal).toBe(5800);
  });

  it("rejects a checkout on or before the checkin", async () => {
    const res = await GET(get({ roomId: "r1", checkIn: "2026-08-19", checkOut: "2026-08-17" }));
    expect(res.status).toBe(400);
  });

  it("rejects a malformed date rather than pricing a NaN stay", async () => {
    const res = await GET(get({ roomId: "r1", checkIn: "17-08-2026", checkOut: "2026-08-19" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/YYYY-MM-DD/);
  });

  it("returns 404 for an unknown room", async () => {
    mockRoomFindMany.mockResolvedValueOnce([]);
    const res = await GET(get({ roomId: "nope", checkIn: "2026-08-17", checkOut: "2026-08-19" }));
    expect(res.status).toBe(404);
  });

  it("returns 404 for a deactivated room", async () => {
    // `priceRooms` filters on isActive in the query, so a deactivated room simply
    // is not returned.
    mockRoomFindMany.mockResolvedValueOnce([]);
    const res = await GET(get({ roomId: "r1", checkIn: "2026-08-17", checkOut: "2026-08-19" }));
    expect(res.status).toBe(404);
  });
});
