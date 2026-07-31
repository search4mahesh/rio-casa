import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifySignature } from "@/lib/razorpay";
import { syncWithChannelManager } from "@/lib/booking-service";
import { Resend } from "resend";
import { ok } from "@/lib/api-response";

const schema = z.object({
  bookingId: z.string(),
  razorpayOrderId: z.string(),
  razorpayPaymentId: z.string(),
  razorpaySignature: z.string(),
});

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid payload" }, { status: 400 });
  }

  const { bookingId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = parsed.data;

  if (!verifySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
    return NextResponse.json({ success: false, error: "Payment verification failed" }, { status: 400 });
  }

  // Update booking: mark paid, store payment ID
  const booking = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      paymentStatus: "paid",
      razorpayPaymentId,
    },
    include: { room: true },
  });

  // Record in payments table
  await prisma.payment.create({
    data: {
      bookingId: booking.id,
      amount: booking.totalAmount,
      paymentMethod: "razorpay",
      paymentType: "full",
      razorpayPaymentId,
      razorpayOrderId,
      razorpaySignature,
      status: "completed",
    },
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      userId: "system",
      action: "payment_received",
      entityType: "booking",
      entityId: booking.id,
      newValue: { paymentStatus: "paid", razorpayPaymentId, totalAmount: booking.totalAmount },
    },
  });

  // Channel manager sync (fire-and-forget)
  syncWithChannelManager(booking.id).catch(console.error);

  // Booking confirmation email
  if (process.env.RESEND_API_KEY) {
    const gstLine =
      booking.cgstAmount && booking.sgstAmount
        ? `<tr><td style="padding:4px 0;color:#6b7280;">CGST + SGST</td><td style="padding:4px 0;">₹${(booking.cgstAmount + booking.sgstAmount).toLocaleString("en-IN")}</td></tr>`
        : "";

    await resend.emails.send({
      from: process.env.EMAIL_FROM ?? "bookings@riocasa.in",
      to: booking.guestEmail,
      subject: `Booking Confirmed — ${booking.bookingNumber} | Rio Casa`,
      html: `
        <div style="font-family:Georgia,serif;max-width:600px;margin:auto;padding:24px;color:#2C2416;">
          <h1 style="color:#4A6741;font-size:26px;margin-bottom:4px;">Booking Confirmed!</h1>
          <p style="color:#6b7280;font-size:13px;margin-top:0;">${booking.bookingNumber}</p>
          <p>Dear ${booking.guestName},</p>
          <p>Your stay at <strong>Rio Casa, Mahabaleshwar</strong> is confirmed. We look forward to welcoming you!</p>
          <hr style="border-color:#e5e7eb;margin:20px 0;" />
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:6px 0;color:#6b7280;">Room</td><td style="padding:6px 0;font-weight:bold;">${booking.room.name}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;">Check-in</td><td style="padding:6px 0;">${new Date(booking.checkIn).toDateString()}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;">Check-out</td><td style="padding:6px 0;">${new Date(booking.checkOut).toDateString()}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;">Nights</td><td style="padding:6px 0;">${booking.nights}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;">Guests</td><td style="padding:6px 0;">${booking.adults}${booking.children > 0 ? ` adults + ${booking.children} children` : ""}</td></tr>
            ${gstLine}
            <tr style="border-top:1px solid #e5e7eb;">
              <td style="padding:8px 0;font-weight:bold;color:#4A6741;">Total Paid</td>
              <td style="padding:8px 0;font-weight:bold;color:#4A6741;font-size:16px;">₹${booking.totalAmount.toLocaleString("en-IN")}</td>
            </tr>
          </table>
          <hr style="border-color:#e5e7eb;margin:20px 0;" />
          ${booking.specialRequests ? `<p style="font-size:13px;"><strong>Special Requests:</strong> ${booking.specialRequests}</p>` : ""}
          <p style="font-size:13px;color:#6b7280;">
            For any queries, call us at +91 98765 43210 or email info@riocasa.in<br/>
            Rio Casa Resort, Mahabaleshwar, Satara District, Maharashtra — 412806
          </p>
        </div>
      `,
    });
  }

  return ok({ bookingId: booking.id, bookingNumber: booking.bookingNumber });
}
