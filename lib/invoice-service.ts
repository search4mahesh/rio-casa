import { prisma } from "@/lib/prisma";
import { nextDailyNumber } from "@/lib/document-numbers";
import { today } from "@/lib/dates";

import { hotelBillingDetails } from "@/lib/hotel-details";

/**
 * Generate the GST tax invoice for a stay, once it is both completed
 * (checked out) and paid.
 *
 * Nothing in this codebase used to call `prisma.invoice.create` at all — the
 * schema, the list/detail/email/print routes and the admin panel all existed,
 * but no booking path ever wrote a row, so the invoice list stayed empty no
 * matter how many stays were paid and checked out.
 *
 * Triggered from check-out rather than booking creation: a tax invoice bills
 * the stay as it actually happened, and a booking is not "completed" — the
 * word the empty state always used — until the guest has left. The values are
 * snapshotted onto the invoice at that moment (same reasoning as laundry's
 * per-line rates in CLAUDE.md): a guest editing their address afterwards, or
 * a manager adjusting the room's price plan, must not rewrite a tax document
 * already handed to a guest.
 *
 * Idempotent — a booking that already has an invoice returns it rather than
 * creating a second one, so a retried request can't double-bill a stay.
 */
export async function generateInvoice(bookingId: string): Promise<{ id: string; invoiceNumber: string }> {
  const existing = await prisma.invoice.findFirst({ where: { bookingId } });
  if (existing) return { id: existing.id, invoiceNumber: existing.invoiceNumber };

  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { room: true, guest: true },
  });

  if (!booking.guestId || !booking.guest) {
    throw new Error(`Booking ${booking.bookingNumber} has no guest on file — cannot invoice`);
  }

  // Booking stores the amounts, not the rate — rebuilt from what was actually
  // charged rather than re-derived from quoteStay/applyGst, so the invoice
  // can never disagree with the total the guest was billed.
  const cgstAmount = booking.cgstAmount ?? 0;
  const sgstAmount = booking.sgstAmount ?? 0;
  const taxableAmount = booking.totalAmount - cgstAmount - sgstAmount;
  const subtotal = taxableAmount + booking.discountAmount;
  const cgstRate = taxableAmount > 0 ? Math.round((cgstAmount / taxableAmount) * 10000) / 100 : 0;
  const sgstRate = taxableAmount > 0 ? Math.round((sgstAmount / taxableAmount) * 10000) / 100 : 0;

  const guestAddress =
    [booking.guest.address, [booking.guest.city, booking.guest.state, booking.guest.pincode].filter(Boolean).join(", ")]
      .filter(Boolean)
      .join("\n") || null;

  // Resolved before the number is allocated, so a misconfigured GSTIN fails
  // without burning an invoice number. Throws in production rather than
  // stamping the placeholder onto a tax document (B-62) — check-out treats
  // this call as bookkeeping and completes regardless.
  const hotel = hotelBillingDetails();

  const invoiceNumber = await nextDailyNumber("invoice", "INV", today(), 3);

  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber,
      bookingId: booking.id,
      guestId: booking.guestId,
      hotelGstin: hotel.gstin,
      hotelName: hotel.name,
      hotelAddress: hotel.address,
      guestName: booking.guestName,
      guestGstin: booking.guest.gstin,
      guestAddress,
      subtotal,
      discount: booking.discountAmount,
      taxableAmount,
      cgstRate,
      sgstRate,
      cgstAmount,
      sgstAmount,
      totalAmount: booking.totalAmount,
      lineItems: [
        {
          description: `${booking.room.name} — Room Charges`,
          nights: booking.nights,
          rate: Math.round((subtotal / booking.nights) * 100) / 100,
          amount: subtotal,
        },
      ],
      invoiceDate: today(),
      status: "generated",
    },
  });

  return { id: invoice.id, invoiceNumber: invoice.invoiceNumber };
}
