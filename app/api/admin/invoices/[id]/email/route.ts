import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { okMessage } from "@/lib/api-response";

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

  if (!invoice) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  const toEmail = invoice.guest.email ?? invoice.booking.guestEmail;
  if (!toEmail) {
    return NextResponse.json({ success: false, error: "No email address on file for this guest" }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ success: false, error: "Email service not configured" }, { status: 503 });
  }

  // Use the request origin to build the print URL (works for both dev and prod)
  const origin = req.nextUrl.origin;
  const printUrl = `${origin}/admin/invoices/${invoice.id}/print`;

  const html = `
    <div style="font-family: 'Helvetica', Arial, sans-serif; max-width: 600px; margin: auto; color: #2C2416;">
      <div style="background: #4A6741; color: white; padding: 24px; text-align: center;">
        <h1 style="margin: 0; font-size: 22px; letter-spacing: 1px;">Rio Casa Resort</h1>
        <p style="margin: 4px 0 0; font-size: 12px; opacity: 0.9;">Mahabaleshwar, Maharashtra</p>
      </div>
      <div style="padding: 28px 24px;">
        <p>Dear ${invoice.guest.firstName} ${invoice.guest.lastName},</p>
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
          Rio Casa Resort · Mahabaleshwar, Maharashtra · GSTIN: 27AAAPL1234C1ZV<br/>
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
      from: "Rio Casa <invoices@riocasa.com>",
      to: toEmail,
      subject: `Tax Invoice ${invoice.invoiceNumber} — Rio Casa Resort`,
      html,
    });
    if (sendError) {
      return NextResponse.json({ success: false, error: sendError.message }, { status: 502 });
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
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "Email send failed" }, { status: 500 });
  }
}
