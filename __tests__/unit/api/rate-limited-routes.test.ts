import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * B-64 — the three unauthenticated endpoints are actually gated.
 *
 * `lib/rate-limit.ts` is tested on its own; what these prove is the wiring:
 * a refusal is a 429 with Retry-After, and — the part that matters — the
 * handler stops there. A booking that still got committed under a 429 would
 * hold its room exactly as before.
 */

vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return { ...actual, checkRateLimit: vi.fn() };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    staff: { findUnique: vi.fn(), update: vi.fn() },
    contactInquiry: { create: vi.fn() },
  },
}));

vi.mock("@/lib/booking-service", () => ({
  createGroupBooking: vi.fn(),
  recalcGuestTotals: vi.fn(),
  releasePromoClaimByCode: vi.fn(),
  resolveSelection: vi.fn(),
}));

vi.mock("@/lib/razorpay", () => ({ createOrder: vi.fn() }));

import { checkRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { resolveSelection, createGroupBooking } from "@/lib/booking-service";

import { POST as loginPOST } from "@/app/api/admin/auth/login/route";
import { POST as contactPOST } from "@/app/api/contact/route";
import { POST as bookingPOST } from "@/app/api/booking/create/route";

const mockLimit = vi.mocked(checkRateLimit);
const db = prisma as unknown as {
  staff: { findUnique: ReturnType<typeof vi.fn> };
  contactInquiry: { create: ReturnType<typeof vi.fn> };
};

function post(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const blocked = { ok: false, retryAfter: 120 };

beforeEach(() => {
  vi.clearAllMocks();
  mockLimit.mockResolvedValue({ ok: true, retryAfter: 60 });
});

describe("POST /api/admin/auth/login", () => {
  const body = { email: "a@riocasa.in", password: "whatever" };

  it("429s once the window is spent, without touching the database", async () => {
    mockLimit.mockResolvedValue(blocked);

    const res = await loginPOST(post("http://localhost/api/admin/auth/login", body));

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("120");
    expect(db.staff.findUnique).not.toHaveBeenCalled();
  });

  it("is keyed by address, not by the email being tried", async () => {
    db.staff.findUnique.mockResolvedValue(null);

    await loginPOST(
      new NextRequest("http://localhost/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.7" },
        body: JSON.stringify(body),
      })
    );

    // Keying by account would let anyone lock a staff member out on purpose.
    expect(mockLimit).toHaveBeenCalledWith("login", "203.0.113.7");
  });

  it("counts an attempt before knowing whether the password was right", async () => {
    db.staff.findUnique.mockResolvedValue(null);

    const res = await loginPOST(post("http://localhost/api/admin/auth/login", body));

    expect(res.status).toBe(401);
    expect(mockLimit).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/contact", () => {
  const body = { name: "Asha", email: "a@example.com", message: "Is a room free in September?" };

  it("429s once the window is spent, writing no row", async () => {
    mockLimit.mockResolvedValue(blocked);

    const res = await contactPOST(post("http://localhost/api/contact", body));

    expect(res.status).toBe(429);
    expect(db.contactInquiry.create).not.toHaveBeenCalled();
  });

  it("lets a normal submission through", async () => {
    db.contactInquiry.create.mockResolvedValue({ id: "ci_1" });

    const res = await contactPOST(post("http://localhost/api/contact", body));

    expect(res.status).toBe(200);
    expect(db.contactInquiry.create).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/booking/create", () => {
  const body = {
    rooms: { standard: 1 },
    checkIn: "2026-12-01T00:00:00.000Z",
    checkOut: "2026-12-03T00:00:00.000Z",
    guestName: "Asha Patil",
    guestEmail: "asha@example.com",
    guestPhone: "9876543210",
    guests: 2,
  };

  it("429s before committing anything — a booking under a 429 would hold a room", async () => {
    mockLimit.mockResolvedValue(blocked);

    const res = await bookingPOST(post("http://localhost/api/booking/create", body));

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("120");
    expect(resolveSelection).not.toHaveBeenCalled();
    expect(createGroupBooking).not.toHaveBeenCalled();
  });

  it("counts the attempt before the body is even parsed", async () => {
    mockLimit.mockResolvedValue(blocked);

    // Malformed on purpose: a flood of junk must cost the attacker the same
    // as a flood of valid payloads.
    const res = await bookingPOST(
      new NextRequest("http://localhost/api/booking/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{ not json",
      })
    );

    expect(res.status).toBe(429);
    expect(mockLimit).toHaveBeenCalledTimes(1);
  });

  it("uses the booking scope, which is tighter than the others", async () => {
    mockLimit.mockResolvedValue(blocked);

    await bookingPOST(post("http://localhost/api/booking/create", body));

    expect(mockLimit).toHaveBeenCalledWith("booking", expect.any(String));
  });
});
