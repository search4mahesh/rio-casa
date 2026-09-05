import Link from "next/link";
import { AlertTriangle, Clock } from "lucide-react";
import type { OperationalAlerts } from "@/lib/alerts";
import { toDayString } from "@/lib/dates";

/**
 * What needs a person, at the top of the screen they already open.
 *
 * A server component: it renders data the dashboard already fetched, so there
 * is no client fetch, no loading state and no `ErrorState` — a failure here
 * fails the page, which the admin error boundary catches.
 *
 * **Renders nothing when there is nothing.** A banner that is always present
 * stops being read; the empty case is the normal one and deserves no space.
 */
export default function AlertsBanner({ alerts }: { alerts: OperationalAlerts }) {
  const { refundsDue, overdueCheckouts } = alerts;
  if (refundsDue.length === 0 && overdueCheckouts.length === 0) return null;

  const refundTotal = refundsDue.reduce((sum, r) => sum + r.amount, 0);

  return (
    <section
      aria-labelledby="alerts-heading"
      className="mb-6 rounded-lg border border-accent/40 bg-accent/5 p-4"
    >
      <h2 id="alerts-heading" className="mb-3 flex items-center gap-2 font-semibold text-earth-text">
        <AlertTriangle size={18} className="text-accent" aria-hidden="true" />
        Needs attention
      </h2>

      {refundsDue.length > 0 && (
        <div className="mb-4">
          {/* The amount leads: it is money the property is holding that is not
              its own, and the number is what makes someone act today. */}
          <p className="mb-2 text-sm font-medium text-earth-text">
            {refundsDue.length === 1 ? "1 payment" : `${refundsDue.length} payments`} to refund
            {" — "}
            <span className="text-accent">₹{refundTotal.toLocaleString("en-IN")}</span>
          </p>
          <p className="mb-2 text-xs text-earth-text/60">
            Paid after the room was released. The stay was never confirmed, so this is not revenue.
          </p>
          <ul className="space-y-1">
            {refundsDue.map((r) => (
              <li key={r.id} className="text-sm">
                <Link href={`/admin/bookings/${r.id}`} className="text-primary hover:underline">
                  {r.bookingNumber}
                </Link>
                <span className="text-earth-text/70">
                  {" — "}{r.guestName}
                  {r.guestPhone ? ` · ${r.guestPhone}` : ""}
                  {" · ₹"}{r.amount.toLocaleString("en-IN")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {overdueCheckouts.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-2 text-sm font-medium text-earth-text">
            <Clock size={15} className="text-accent" aria-hidden="true" />
            {overdueCheckouts.length === 1 ? "1 stay" : `${overdueCheckouts.length} stays`} past
            departure and still checked in
          </p>
          <p className="mb-2 text-xs text-earth-text/60">
            Each one holds its room and has no invoice raised.
          </p>
          <ul className="space-y-1">
            {overdueCheckouts.map((b) => (
              <li key={b.id} className="text-sm">
                <Link href={`/admin/bookings/${b.id}`} className="text-primary hover:underline">
                  {b.bookingNumber}
                </Link>
                <span className="text-earth-text/70">
                  {" — "}{b.guestName} · {b.roomName} · due {toDayString(b.checkOut)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
