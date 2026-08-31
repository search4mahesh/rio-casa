import { NextRequest } from "next/server";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { okMessage, fail } from "@/lib/api-response";
import { escapeHtml } from "@/lib/html-email";
import { PROPERTY } from "@/lib/property";

// POST /api/admin/invoices/[id]/email — email invoice to the guest
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, "frontdesk");
  if (!auth.ok) return auth.response;
  const staff = auth.staff;

  const { id } = await params;

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      booking: { select: { bookingNumber: true, guestEmail: true } },
      guest: { select: { firstName: true, lastName: true, email: true } },
    },
  });

  if (!invoice) return fail("Not found", 404);

  const toEmail = invoice.guest.email ?? invoice.booking.guestEmail;
  if (!toEmail) {
    return fail("No email address on file for this guest", 400);
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return fail("Email service not configured", 503);
  }

  // Use the request origin to build the print URL (works for both dev and prod)
  const origin = req.nextUrl.origin;
  const printUrl = `${origin}/admin/invoices/${invoice.id}/print`;

  const html = `
    <div style="font-family: 'Helvetica', Arial, sans-serif; max-width: 600px; margin: auto; color: #2C2416;">
      <div style="background: #4A6741; color: white; padding: 24px; text-align: center;">
        <h1 style="margin: 0; font-size: 22px; letter-spacing: 1px;">${PROPERTY.billingName}</h1>
        <p style="margin: 4px 0 0; font-size: 12px; opacity: 0.9;">${PROPERTY.city}, ${PROPERTY.region}</p>
      </div>
      <div style="padding: 28px 24px;">
        <p>Dear ${escapeHtml(invoice.guest.firstName)} ${escapeHtml(invoice.guest.lastName)},</p>
        <p>Thank you for staying with us. Please find your tax invoice details below.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
          <tr><td style="padding: 8px 0; color: #777;">Invoice Number:</td><td style="text-align: right; font-weight: 600;">${invoice.invoiceNumber}</td></tr>
          <tr><td style="padding: 8px 0; color: #777;">Booking Number:</td><td style="text-align: right; font-weight: 600;">${invoice.booking.bookingNumber}</td></tr>
          <tr><td style="padding: 8px 0; color: #777;">Invoice Date:</td><td style="text-align: right;">${invoice.invoiceDate.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</td></tr>
          <tr style="border-top: 2px solid #4A6741;"><td style="padding: 12px 0; font-weight: 600;">Total Amount:</td><td style="text-align: right; font-size: 18px; font-weight: 700; color: #4A6741;">₹${Number(invoice.totalAmount).toLocaleString("en-IN")}</td></tr>
        </table>
        <p style="margin: 24px 0;">
          <a href="${printUrl}" style="display: inline-block; background: #4A6741; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">View Full Invoice</a>
        </p>
        <p style="font-size: 12px; color: #777; margin-top: 32px; border-top: 1px solid #eee; padding-top: 16px;">
          ${escapeHtml(invoice.hotelName)} · ${escapeHtml(invoice.hotelAddress)} · GSTIN: ${escapeHtml(invoice.hotelGstin)}<br/>
          For any queries, reply to this email.
        </p>
      </div>
    </div>
  `;

  try {
    const resend = new Resend(apiKey);
    // The SDK resolves `{ data, error }` for an API-level failure (bad key,
    // rejected recipient, …) rather than throwing — only a network failure
    // throws. Marking the invoice "sent" and writing an audit log entry off
    // the promise merely resolving meant a rejected send still told staff
    // "Invoice emailed to X" (B-37) — the guest never got it, and the invoice
    // list showed a status that wasn't true.
    const { error: sendError } = await resend.emails.send({
      from: process.env.EMAIL_FROM ?? PROPERTY.bookingsEmail,
      to: toEmail,
      subject: `Tax Invoice ${invoice.invoiceNumber} — ${PROPERTY.billingName}`,
      html,
    });
    if (sendError) {
      return fail(sendError.message, 502);
    }

    await prisma.invoice.update({
      where: { id },
      data: { status: "sent" },
    });

    await prisma.auditLog.create({
      data: {
        userId: staff.staffId,
        action: "email_invoice",
        entityType: "invoice",
        entityId: id,
        newValue: { to: toEmail, by: staff.name } as never,
      },
    });

    return okMessage(`Invoice emailed to ${toEmail}`);
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Email send failed", 500);
  }
}
