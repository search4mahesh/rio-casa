import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/booking-service", () => ({
  checkAvailability: vi.fn().mockResolvedValue({ available: true }),
  getAvailableRooms: vi.fn().mockResolvedValue([
    { id: "r1", name: "Deluxe 101", slug: "deluxe-room", pricePerNight: 4500, maxGuests: 2, roomType: "Deluxe", extraBed: true, amenities: [], images: [] },
  ]),
}));

import { GET } from "@/app/api/booking/availability/route";

function req(params: Record<string, string>) {
  const url = new URL("http://localhost/api/booking/availability");
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url.toString());
}

describe("GET /api/booking/availability", () => {
  it("returns 400 when checkIn is missing", async () => {
    const res = await GET(req({ checkOut: "2026-07-10" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("returns 400 when checkOut is missing", async () => {
    const res = await GET(req({ checkIn: "2026-07-05" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("returns 400 for an invalid date format", async () => {
    const res = await GET(req({ checkIn: "not-a-date", checkOut: "2026-07-10" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid date/i);
  });

  it("returns 400 when checkIn equals checkOut", async () => {
    const res = await GET(req({ checkIn: "2026-07-05", checkOut: "2026-07-05" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/checkOut must be after/i);
  });

  it("returns 400 when checkIn is after checkOut", async () => {
    const res = await GET(req({ checkIn: "2026-07-10", checkOut: "2026-07-05" }));
    expect(res.status).toBe(400);
  });

  it("returns 200 with room list for valid dates", async () => {
    const res = await GET(req({ checkIn: "2026-07-05", checkOut: "2026-07-10", guests: "2" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data[0]).toHaveProperty("slug");
  });
});
