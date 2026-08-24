import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const { mockBookingFindMany, mockLogCreate, mockLogFindMany, mockResendSend } = vi.hoisted(() => ({
  mockBookingFindMany: vi.fn().mockResolvedValue([]),
  mockLogCreate: vi.fn().mockResolvedValue({}),
  mockLogFindMany: vi.fn().mockResolvedValue([]),
  mockResendSend: vi.fn().mockResolvedValue({ data: { id: "msg_1" }, error: null }),
}));

vi.mock("@/lib/admin-auth", () => ({
  verifyAdminToken: vi.fn().mockResolvedValue({ staffId: "s1", role: "owner", name: "Admin", email: "a@a.com" }),
  ADMIN_COOKIE: "admin_token",
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    booking: { findMany: mockBookingFindMany },
    communicationLog: { create: mockLogCreate, findMany: mockLogFindMany },
  },
}));

vi.mock("resend", () => ({
  Resend: function ResendMock() { return { emails: { send: mockResendSend } }; },
}));

import { GET, POST } from "@/app/api/admin/communications/route";

function makeReq(method: string, body?: object) {
  const init: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body) init.body = JSON.stringify(body);
  const req = new NextRequest("http://localhost/api/admin/communications", init);
  req.cookies.set("admin_token", "mock_token");
  return req;
}

function mockBooking(opts: Partial<{ guestName: string; guestPhone: string; guestEmail: string; bookingNumber: string; checkIn: string; roomName: string }>) {
  return {
    guestName: opts.guestName ?? "Ravi Kumar",
    guestPhone: opts.guestPhone ?? "9876543210",
    guestEmail: opts.guestEmail ?? "ravi@example.com",
    bookingNumber: opts.bookingNumber ?? "BK001",
    checkIn: new Date(opts.checkIn ?? "2026-06-15"),
    room: { name: opts.roomName ?? "Deluxe 101" },
  };
}

describe("GET /api/admin/communications", () => {
  beforeEach(() => { mockLogFindMany.mockReset(); mockLogFindMany.mockResolvedValue([]); });

  it("returns 401 without auth", async () => {
    const { verifyAdminToken } = await import("@/lib/admin-auth");
    vi.mocked(verifyAdminToken).mockResolvedValueOnce(null as never);
    const res = await GET(makeReq("GET"));
    expect(res.status).toBe(401);
  });

  it("returns the recent communication logs", async () => {
    mockLogFindMany.mockResolvedValueOnce([{
      id: "log1", channel: "email", subject: "Test", body: "Hi", recipients: 5,
      sentBy: "Admin", filter: "{}", createdAt: new Date(),
    }]);
    const res = await GET(makeReq("GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
  });
});

describe("POST /api/admin/communications — preview", () => {
  beforeEach(() => {
    mockBookingFindMany.mockReset(); mockBookingFindMany.mockResolvedValue([]);
    mockLogCreate.mockReset(); mockLogCreate.mockResolvedValue({});
  });

  it("returns 401 without auth", async () => {
    const { verifyAdminToken } = await import("@/lib/admin-auth");
    vi.mocked(verifyAdminToken).mockResolvedValueOnce(null as never);
    const res = await POST(makeReq("POST", { action: "preview", channel: "email", filter: { type: "checked-in" }, subject: "x", body: "y" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when email channel is missing subject", async () => {
    const res = await POST(makeReq("POST", { action: "preview", channel: "email", filter: { type: "checked-in" }, body: "Hi" }));
    expect(res.status).toBe(400);
  });

  it("does NOT require subject for whatsapp channel", async () => {
    mockBookingFindMany.mockResolvedValueOnce([mockBooking({})]);
    const res = await POST(makeReq("POST", { action: "preview", channel: "whatsapp", filter: { type: "checked-in" }, body: "Hi {{guestName}}" }));
    expect(res.status).toBe(200);
  });

  it("returns preview with totalRecipients and reachableCount", async () => {
    mockBookingFindMany.mockResolvedValueOnce([
      mockBooking({ guestEmail: "a@a.com" }),
      mockBooking({ guestEmail: "b@b.com" }),
      mockBooking({ guestEmail: "" }), // unreachable for email
    ]);
    const res = await POST(makeReq("POST", {
      action: "preview", channel: "email", filter: { type: "checked-in" },
      subject: "Hello", body: "Hi {{guestName}}",
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.totalRecipients).toBe(3);
    expect(body.data.reachableCount).toBe(2);
    expect(body.data.skippedCount).toBe(1);
  });

  it("substitutes merge tags in sample body", async () => {
    mockBookingFindMany.mockResolvedValueOnce([mockBooking({ guestName: "Priya Sharma", bookingNumber: "BK999" })]);
    const res = await POST(makeReq("POST", {
      action: "preview", channel: "email", filter: { type: "checked-in" },
      subject: "Hi {{guestName}}", body: "Booking {{bookingNumber}}",
    }));
    const body = await res.json();
    expect(body.data.sample.subject).toBe("Hi Priya Sharma");
    expect(body.data.sample.body).toBe("Booking BK999");
  });

  it("queries upcoming arrivals with status: confirmed", async () => {
    await POST(makeReq("POST", {
      action: "preview", channel: "email", filter: { type: "upcoming-arrivals", days: 3 },
      subject: "x", body: "y",
    }));
    expect(mockBookingFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "confirmed" }),
      })
    );
  });

  it("supports manual recipient list", async () => {
    const res = await POST(makeReq("POST", {
      action: "preview", channel: "email",
      filter: { type: "manual", recipients: [
        { guestName: "Test Guest", email: "test@example.com" },
        { guestName: "No Email", phone: "9999999999" },
      ]},
      subject: "x", body: "y",
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.totalRecipients).toBe(2);
    expect(body.data.reachableCount).toBe(1); // only one has email
  });
});

describe("POST /api/admin/communications — send", () => {
  const originalKey = process.env.RESEND_API_KEY;
  beforeEach(() => {
    mockBookingFindMany.mockReset();
    mockResendSend.mockReset(); mockResendSend.mockResolvedValue({ data: { id: "msg_1" }, error: null });
    mockLogCreate.mockReset(); mockLogCreate.mockResolvedValue({});
    process.env.RESEND_API_KEY = "re_test_key";
  });
  afterEach(() => { process.env.RESEND_API_KEY = originalKey; });

  it("returns 400 when there are zero reachable recipients", async () => {
    mockBookingFindMany.mockResolvedValueOnce([]);
    const res = await POST(makeReq("POST", {
      action: "send", channel: "email", filter: { type: "checked-in" },
      subject: "x", body: "y",
    }));
    expect(res.status).toBe(400);
  });

  it("returns 503 when sending email without RESEND_API_KEY", async () => {
    delete process.env.RESEND_API_KEY;
    mockBookingFindMany.mockResolvedValueOnce([mockBooking({})]);
    const res = await POST(makeReq("POST", {
      action: "send", channel: "email", filter: { type: "checked-in" },
      subject: "x", body: "y",
    }));
    expect(res.status).toBe(503);
  });

  it("sends an email to each reachable recipient and logs it", async () => {
    mockBookingFindMany.mockResolvedValueOnce([
      mockBooking({ guestEmail: "a@a.com", guestName: "Alpha" }),
      mockBooking({ guestEmail: "b@b.com", guestName: "Beta" }),
    ]);
    const res = await POST(makeReq("POST", {
      action: "send", channel: "email", filter: { type: "checked-in" },
      subject: "Hi {{guestName}}", body: "Welcome {{guestName}}",
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.sentCount).toBe(2);
    expect(mockResendSend).toHaveBeenCalledTimes(2);
    expect(mockLogCreate).toHaveBeenCalledTimes(1);
  });

  it("generates wa.me URLs for WhatsApp channel without calling Resend", async () => {
    mockBookingFindMany.mockResolvedValueOnce([mockBooking({ guestPhone: "+91 9876543210" })]);
    const res = await POST(makeReq("POST", {
      action: "send", channel: "whatsapp", filter: { type: "checked-in" }, body: "Hi {{guestName}}",
    }));
    expect(res.status).toBe(200);
    expect(mockResendSend).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.data.whatsappLinks).toHaveLength(1);
    expect(body.data.whatsappLinks[0].url).toMatch(/^https:\/\/wa\.me\/919876543210\?text=/);
  });

  it("skips recipients with invalid phone numbers", async () => {
    mockBookingFindMany.mockResolvedValueOnce([
      mockBooking({ guestPhone: "9876543210", guestName: "Good" }),
      mockBooking({ guestPhone: "123", guestName: "Bad" }),
    ]);
    const res = await POST(makeReq("POST", {
      action: "send", channel: "whatsapp", filter: { type: "checked-in" }, body: "Hi",
    }));
    const body = await res.json();
    expect(body.data.sentCount).toBe(1);
    expect(body.data.errors.length).toBe(1);
  });

  it("captures send errors per recipient and continues", async () => {
    mockBookingFindMany.mockResolvedValueOnce([
      mockBooking({ guestEmail: "a@a.com", guestName: "Alpha" }),
      mockBooking({ guestEmail: "b@b.com", guestName: "Beta" }),
    ]);
    mockResendSend
      .mockResolvedValueOnce({ data: { id: "ok" }, error: null })
      .mockRejectedValueOnce(new Error("upstream 500"));
    const res = await POST(makeReq("POST", {
      action: "send", channel: "email", filter: { type: "checked-in" },
      subject: "x", body: "y",
    }));
    const body = await res.json();
    expect(body.data.sentCount).toBe(1);
    expect(body.data.errors).toHaveLength(1);
  });

  // B-37 — the SDK resolves `{ data: null, error }` for an API-level failure
  // (bad key, rejected recipient, …) rather than throwing. Counting on the
  // promise merely resolving used to credit `sentCount` for every recipient
  // regardless, so a bad key reported "sent to N guests" for a campaign that
  // reached nobody.
  it("does not count a resolved-but-rejected send as sent", async () => {
    mockBookingFindMany.mockResolvedValueOnce([
      mockBooking({ guestEmail: "a@a.com", guestName: "Alpha" }),
      mockBooking({ guestEmail: "b@b.com", guestName: "Beta" }),
    ]);
    mockResendSend.mockResolvedValue({ data: null, error: { name: "validation_error", message: "API key is invalid" } });
    const res = await POST(makeReq("POST", {
      action: "send", channel: "email", filter: { type: "checked-in" },
      subject: "x", body: "y",
    }));
    const body = await res.json();
    expect(body.data.sentCount).toBe(0);
    expect(body.data.errors).toHaveLength(2);
    expect(body.data.errors[0]).toContain("API key is invalid");
  });
});
