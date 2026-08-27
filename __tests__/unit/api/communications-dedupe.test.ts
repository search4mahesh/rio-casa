/**
 * B-50 — past-guest campaigns deduplicated on the wrong column for WhatsApp.
 *
 * `resolveRecipients` ended the past-guests branch with
 * `distinct: ["guestEmail"]`. That is right for an email campaign — two stays
 * by one guest should not mean two emails — but the channel filter ran
 * *afterwards*, so a WhatsApp campaign had already been deduplicated on a
 * column it never messages anyone by.
 *
 * The walk-in form takes an email marked "optional" and stores `""` when it is
 * blank, so every guest without one shared a single key. Two checked-out
 * walk-ins with no email, one "come back and see us" WhatsApp campaign: one
 * guest was messaged, the other silently vanished, and `skippedCount` did not
 * report it because the row had been dropped before the count was taken.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockBookingFindMany, mockCommLogCreate } = vi.hoisted(() => ({
  mockBookingFindMany: vi.fn(),
  mockCommLogCreate: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/admin-auth", () => ({
  verifyAdminToken: vi.fn().mockResolvedValue({ staffId: "s1", role: "owner", name: "Admin", email: "a@a.com" }),
  resolveActiveStaff: vi.fn().mockResolvedValue({ staffId: "s1", role: "owner", name: "Admin", email: "a@a.com" }),
  ADMIN_COOKIE: "admin_token",
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    booking: { findMany: mockBookingFindMany },
    communicationLog: { create: mockCommLogCreate, findMany: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock("resend", () => ({ Resend: class { emails = { send: vi.fn() }; } }));

import { POST } from "@/app/api/admin/communications/route";

/**
 * Three past stays. Two are walk-ins with no email on file — distinct people,
 * distinct phones — and one is a returning guest with two stays.
 */
const PAST_STAYS = [
  { guestName: "Ashok", guestPhone: "9111111111", guestEmail: "", bookingNumber: "BK-1", checkIn: new Date("2026-06-01T00:00:00.000Z"), room: { name: "Standard" } },
  { guestName: "Bhavna", guestPhone: "9222222222", guestEmail: "", bookingNumber: "BK-2", checkIn: new Date("2026-06-05T00:00:00.000Z"), room: { name: "Deluxe" } },
  { guestName: "Chetan", guestPhone: "9333333333", guestEmail: "c@example.com", bookingNumber: "BK-3", checkIn: new Date("2026-06-09T00:00:00.000Z"), room: { name: "Luxury" } },
  { guestName: "Chetan", guestPhone: "9333333333", guestEmail: "c@example.com", bookingNumber: "BK-4", checkIn: new Date("2026-07-02T00:00:00.000Z"), room: { name: "Luxury" } },
];

function post(body: Record<string, unknown>) {
  const r = new NextRequest("http://localhost/api/admin/communications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  r.cookies.set("admin_token", "tok");
  return r;
}

const PREVIEW = { action: "preview", filter: { type: "past-guests" }, body: "Hi {{guestName}}" };

beforeEach(() => {
  vi.clearAllMocks();
  mockBookingFindMany.mockResolvedValue(PAST_STAYS);
});

describe("past-guest campaigns — WhatsApp (B-50)", () => {
  it("keeps every guest with a phone, even with no email on file", async () => {
    const res = await POST(post({ ...PREVIEW, channel: "whatsapp" }));
    const { data } = await res.json();

    // The bug: both emailless walk-ins shared `guestEmail: ""`, so one was
    // dropped before its phone number was ever considered.
    expect(data.reachableCount).toBe(3);
    const phones = data.recipients.map((r: { phone: string }) => r.phone).sort();
    expect(phones).toEqual(["9111111111", "9222222222", "9333333333"]);
  });

  it("still collapses one guest's repeat stays into a single message", async () => {
    const res = await POST(post({ ...PREVIEW, channel: "whatsapp" }));
    const { data } = await res.json();

    // Chetan stayed twice on one phone number — that is one message, not two.
    const chetan = data.recipients.filter((r: { phone: string }) => r.phone === "9333333333");
    expect(chetan).toHaveLength(1);
  });

  it("does not stop deduplicating just because the SQL distinct went away", async () => {
    const res = await POST(post({ ...PREVIEW, channel: "whatsapp" }));
    const { data } = await res.json();

    expect(data.reachableCount).toBeLessThan(PAST_STAYS.length);
    // Prisma must no longer be asked to dedupe — the key it would use is wrong
    // for this channel.
    const pastQuery = mockBookingFindMany.mock.calls.map((c) => c[0]).at(-1);
    expect(pastQuery?.distinct).toBeUndefined();
  });
});

describe("past-guest campaigns — email is unchanged (B-50)", () => {
  it("still sends one email per address and drops the emailless", async () => {
    const res = await POST(post({ ...PREVIEW, channel: "email", subject: "Come back" }));
    const { data } = await res.json();

    // Only Chetan has an address, and his two stays are one email.
    expect(data.reachableCount).toBe(1);
    expect(data.recipients[0].email).toBe("c@example.com");
  });

  it("reports the emailless guests as skipped rather than losing them silently", async () => {
    const res = await POST(post({ ...PREVIEW, channel: "email", subject: "Come back" }));
    const { data } = await res.json();

    // They are unreachable by email, which is true and worth showing — the bug
    // was that they disappeared before anything could count them.
    expect(data.skippedCount).toBeGreaterThan(0);
  });

  it("treats addresses case-insensitively, so one person is one message", async () => {
    mockBookingFindMany.mockResolvedValue([
      { ...PAST_STAYS[2], guestEmail: "Chetan@Example.com" },
      { ...PAST_STAYS[3], guestEmail: "chetan@example.com" },
    ]);

    const res = await POST(post({ ...PREVIEW, channel: "email", subject: "Come back" }));
    const { data } = await res.json();
    expect(data.reachableCount).toBe(1);
  });
});
