import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const { mockInvoiceFindUnique, mockInvoiceUpdate, mockAuditCreate, mockResendSend } = vi.hoisted(() => ({
  mockInvoiceFindUnique: vi.fn().mockResolvedValue(null),
  mockInvoiceUpdate: vi.fn().mockResolvedValue({}),
  mockAuditCreate: vi.fn().mockResolvedValue({}),
  mockResendSend: vi.fn().mockResolvedValue({ data: { id: "msg_1" }, error: null }),
}));

vi.mock("@/lib/admin-auth", () => ({
  verifyAdminToken: vi.fn().mockResolvedValue({ staffId: "s1", role: "owner", name: "Admin", email: "a@a.com" }),
  resolveActiveStaff: vi.fn().mockResolvedValue({ staffId: "s1", role: "owner", name: "Admin", email: "a@a.com" }),
  ADMIN_COOKIE: "admin_token",
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    invoice: { findUnique: mockInvoiceFindUnique, update: mockInvoiceUpdate },
    auditLog: { create: mockAuditCreate },
  },
}));

vi.mock("resend", () => ({
  Resend: function ResendMock() { return { emails: { send: mockResendSend } }; },
}));

import { GET } from "@/app/api/admin/invoices/[id]/route";
import { POST as emailPost } from "@/app/api/admin/invoices/[id]/email/route";

function makeReq(method: string) {
  const req = new NextRequest("http://localhost/api/admin/invoices/inv1", { method });
  req.cookies.set("admin_token", "mock_token");
  return req;
}

const idParams = { params: Promise.resolve({ id: "inv1" }) };

const fullInvoice = {
  id: "inv1", invoiceNumber: "INV-001",
  invoiceDate: new Date("2026-05-15"), totalAmount: 15000,
  booking: { bookingNumber: "BK001", guestEmail: "guest@example.com" },
  guest: { firstName: "Ravi", lastName: "Kumar", email: "ravi@example.com" },
};

describe("GET /api/admin/invoices/[id]", () => {
  beforeEach(() => { mockInvoiceFindUnique.mockReset(); });

  it("returns 401 without auth", async () => {
    const { resolveActiveStaff } = await import("@/lib/admin-auth");
    vi.mocked(resolveActiveStaff).mockResolvedValueOnce(null as never);
    const res = await GET(makeReq("GET"), idParams);
    expect(res.status).toBe(401);
  });

  it("returns 404 when invoice does not exist", async () => {
    mockInvoiceFindUnique.mockResolvedValueOnce(null);
    const res = await GET(makeReq("GET"), idParams);
    expect(res.status).toBe(404);
  });

  it("returns 200 with invoice + booking + guest details", async () => {
    mockInvoiceFindUnique.mockResolvedValueOnce(fullInvoice);
    const res = await GET(makeReq("GET"), idParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.invoiceNumber).toBe("INV-001");
  });

  it("includes booking and guest relations in the query", async () => {
    mockInvoiceFindUnique.mockResolvedValueOnce(fullInvoice);
    await GET(makeReq("GET"), idParams);
    expect(mockInvoiceFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({ booking: expect.any(Object), guest: expect.any(Object) }),
      })
    );
  });
});

describe("POST /api/admin/invoices/[id]/email", () => {
  const originalKey = process.env.RESEND_API_KEY;

  beforeEach(() => {
    mockInvoiceFindUnique.mockReset();
    mockInvoiceUpdate.mockReset(); mockInvoiceUpdate.mockResolvedValue({});
    mockResendSend.mockReset(); mockResendSend.mockResolvedValue({ data: { id: "msg_1" }, error: null });
    mockAuditCreate.mockReset();
    process.env.RESEND_API_KEY = "re_test_key";
  });

  afterEach(() => { process.env.RESEND_API_KEY = originalKey; });

  it("returns 401 without auth", async () => {
    const { resolveActiveStaff } = await import("@/lib/admin-auth");
    vi.mocked(resolveActiveStaff).mockResolvedValueOnce(null as never);
    const res = await emailPost(makeReq("POST"), idParams);
    expect(res.status).toBe(401);
  });

  it("returns 404 when invoice does not exist", async () => {
    mockInvoiceFindUnique.mockResolvedValueOnce(null);
    const res = await emailPost(makeReq("POST"), idParams);
    expect(res.status).toBe(404);
  });

  it("returns 400 when guest has no email and booking has no email", async () => {
    mockInvoiceFindUnique.mockResolvedValueOnce({
      ...fullInvoice,
      guest: { firstName: "Ravi", lastName: "Kumar", email: null },
      booking: { bookingNumber: "BK001", guestEmail: null },
    });
    const res = await emailPost(makeReq("POST"), idParams);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/no email/i);
  });

  it("returns 503 when RESEND_API_KEY is not configured", async () => {
    delete process.env.RESEND_API_KEY;
    mockInvoiceFindUnique.mockResolvedValueOnce(fullInvoice);
    const res = await emailPost(makeReq("POST"), idParams);
    expect(res.status).toBe(503);
  });

  it("sends an email and returns 200 on success", async () => {
    mockInvoiceFindUnique.mockResolvedValueOnce(fullInvoice);
    const res = await emailPost(makeReq("POST"), idParams);
    expect(res.status).toBe(200);
    expect(mockResendSend).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toMatch(/ravi@example.com/i);
  });

  it("falls back to booking.guestEmail when guest.email is null", async () => {
    mockInvoiceFindUnique.mockResolvedValueOnce({
      ...fullInvoice,
      guest: { firstName: "Ravi", lastName: "Kumar", email: null },
    });
    const res = await emailPost(makeReq("POST"), idParams);
    expect(res.status).toBe(200);
    const callArgs = mockResendSend.mock.calls[0][0];
    expect(callArgs.to).toBe("guest@example.com");
  });

  it("marks the invoice as 'sent' after successful email", async () => {
    mockInvoiceFindUnique.mockResolvedValueOnce(fullInvoice);
    await emailPost(makeReq("POST"), idParams);
    expect(mockInvoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "inv1" },
        data: { status: "sent" },
      })
    );
  });

  it("writes an audit log on successful send", async () => {
    mockInvoiceFindUnique.mockResolvedValueOnce(fullInvoice);
    await emailPost(makeReq("POST"), idParams);
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "email_invoice" }),
      })
    );
  });

  it("returns 500 when Resend throws an error", async () => {
    mockInvoiceFindUnique.mockResolvedValueOnce(fullInvoice);
    mockResendSend.mockRejectedValueOnce(new Error("Resend API failure"));
    const res = await emailPost(makeReq("POST"), idParams);
    expect(res.status).toBe(500);
  });

  // B-37 — the SDK resolves `{ data: null, error }` for an API-level failure
  // (bad key, rejected recipient, …) rather than throwing; only a network
  // failure throws. The route used to mark the invoice "sent" and write an
  // audit row off the promise merely resolving, so a rejected send still told
  // staff "Invoice emailed to X" with nothing actually delivered.
  it("does not mark the invoice sent when Resend resolves with an error", async () => {
    mockInvoiceFindUnique.mockResolvedValueOnce(fullInvoice);
    mockResendSend.mockResolvedValueOnce({ data: null, error: { name: "validation_error", message: "API key is invalid" } });
    const res = await emailPost(makeReq("POST"), idParams);
    const body = await res.json();
    expect(res.status).toBe(502);
    expect(body.success).toBe(false);
    expect(mockInvoiceUpdate).not.toHaveBeenCalled();
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });
});
