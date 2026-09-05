import { prisma } from "@/lib/prisma";
import { today } from "@/lib/dates";

/**
 * The things that need a person, and that nothing was showing anyone.
 *
 * Seventeen paths write `audit_log` and three write alarming `console.error`
 * lines — "PAYMENT RECEIVED FOR A CANCELLED BOOKING", among others — and the
 * only reader for any of it is `/admin/setup?tab=audit`, which an owner has to
 * think to open. On a property this size nobody is watching a log stream, so a
 * guest's money can sit unrefunded for as long as it takes someone to wonder.
 *
 * This is deliberately not a general error feed. Two things qualify: money the
 * property is holding that is not its own, and a stay the system still believes
 * is in progress. Both need a human decision, and neither shows up anywhere
 * else in the panel. An alert nobody can act on trains people to ignore the
 * ones they can.
 */

export type RefundDue = {
  id: string;
  bookingNumber: string;
  guestName: string;
  guestPhone: string | null;
  amount: number;
  razorpayPaymentId: string;
  cancelledAt: Date | null;
};

export type OverdueCheckout = {
  id: string;
  bookingNumber: string;
  guestName: string;
  roomName: string;
  checkOut: Date;
};

export type OperationalAlerts = {
  refundsDue: RefundDue[];
  overdueCheckouts: OverdueCheckout[];
};

/**
 * Money taken for a stay that did not happen.
 *
 * Written by `recordUnmatchedPayment` in `lib/payment-settlement.ts`: the guest
 * paid after their hold expired, the room could not be given back, so the
 * booking stays `cancelled` and the payment is recorded for refund. That path
 * logs loudly and audits with `needsRefund: true` — and until now, that was the
 * whole of it.
 *
 * Matched on the booking rather than by reading JSON out of `audit_log`,
 * because the booking columns are the durable fact: a cancelled stay holding a
 * Razorpay payment id with nothing refunded against it. `refundAmount` being
 * set is what marks it handled, since there is no `refunded` payment status.
 */
async function refundsDue(): Promise<RefundDue[]> {
  const rows = await prisma.booking.findMany({
    where: {
      status: { in: ["cancelled", "no_show"] },
      razorpayPaymentId: { not: null },
      OR: [{ refundAmount: null }, { refundAmount: 0 }],
    },
    select: {
      id: true, bookingNumber: true, guestName: true, guestPhone: true,
      totalAmount: true, razorpayPaymentId: true, cancelledAt: true,
    },
    orderBy: { cancelledAt: "desc" },
    take: 50,
  });

  return rows.map((b) => ({
    id: b.id,
    bookingNumber: b.bookingNumber,
    guestName: b.guestName,
    guestPhone: b.guestPhone,
    amount: b.totalAmount,
    razorpayPaymentId: b.razorpayPaymentId!,
    cancelledAt: b.cancelledAt,
  }));
}

/**
 * Stays the system still believes are in progress after their departure day.
 *
 * The night audit *flags* these and deliberately does not close them (a guest
 * may still be in the room, and checking out issues a GST invoice), so they
 * accumulate until someone presses the button. Six of them once sat up to 91
 * days past departure, holding their rooms and with no invoice raised (B-51).
 * The audit's own screen shows them; this puts them where staff already look.
 */
async function overdueCheckouts(): Promise<OverdueCheckout[]> {
  const rows = await prisma.booking.findMany({
    where: { status: "checked_in", checkOut: { lt: today() } },
    select: {
      id: true, bookingNumber: true, guestName: true, checkOut: true,
      room: { select: { name: true } },
    },
    orderBy: { checkOut: "asc" },
    take: 50,
  });

  return rows.map((b) => ({
    id: b.id,
    bookingNumber: b.bookingNumber,
    guestName: b.guestName,
    roomName: b.room.name,
    checkOut: b.checkOut,
  }));
}

/**
 * `includeMoney` is false for front desk.
 *
 * An overdue checkout is theirs to chase — they can walk to the room. A refund
 * is a manager's decision and skipping the query for everyone else keeps it off
 * the wire entirely, rather than fetching it and hiding it in the markup.
 */
export async function getOperationalAlerts(includeMoney: boolean): Promise<OperationalAlerts> {
  const [refunds, overdue] = await Promise.all([
    includeMoney ? refundsDue() : Promise.resolve([]),
    overdueCheckouts(),
  ]);
  return { refundsDue: refunds, overdueCheckouts: overdue };
}
