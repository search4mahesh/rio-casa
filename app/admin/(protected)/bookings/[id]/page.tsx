"use client";

import { useEffect, useState, useId } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useToast, Toast } from "@/components/ui/Toast";

type BookingDetail = {
  id: string;
  bookingNumber: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  children: number;
  extraBed: boolean;
  totalAmount: number;
  cgstAmount?: number;
  sgstAmount?: number;
  discountAmount: number;
  status: string;
  paymentStatus: string;
  source: string;
  specialRequests?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  cancelledAt?: string;
  cancellationReason?: string;
  refundAmount?: number;
  actualCheckin?: string;
  actualCheckout?: string;
  createdAt: string;
  room: { name: string; roomNumber?: string; roomType: string; floor?: number };
  guest?: { firstName: string; lastName: string; phone: string; email?: string } | null;
  payments: { id: string; amount: unknown; paymentMethod: string; paymentType: string; status: string; createdAt: string; receivedBy?: string }[];
  invoices: { id: string; invoiceNumber: string; status: string; createdAt: string }[];
};

function StatusBadge({ status, className }: { status: string; className?: string }) {
  const map: Record<string, string> = {
    confirmed: "bg-blue-100 text-blue-700",
    checked_in: "bg-green-100 text-green-700",
    checked_out: "bg-gray-100 text-gray-600",
    cancelled: "bg-red-100 text-red-600",
    no_show: "bg-orange-100 text-orange-700",
    paid: "bg-green-100 text-green-700",
    pending: "bg-yellow-100 text-yellow-700",
    cash: "bg-emerald-100 text-emerald-700",
    failed: "bg-red-100 text-red-600",
    completed: "bg-green-100 text-green-700",
  };
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${map[status] ?? "bg-gray-100 text-gray-600"} ${className ?? ""}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
function fmtTime(d: string) {
  return new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtCurrency(n: unknown) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n));
}

export default function BookingDetailPage() {
  const fieldId = useId();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");
  const { toast, showToast } = useToast();
  const [cancelReason, setCancelReason] = useState("");
  const [showCancel, setShowCancel] = useState(false);

  async function load() {
    const res = await fetch(`/api/admin/bookings/${id}`);
    const data = await res.json();
    if (data.success) setBooking(data.data);
    setLoading(false);
  }

  useEffect(() => { load(); }, [id]);


  async function doAction(action: "checkin" | "checkout", label: string) {
    setActionLoading(action);
    const res = await fetch(`/api/admin/bookings/${id}/${action}`, { method: "PATCH" });
    const data = await res.json();
    if (data.success) { showToast(data.message); load(); }
    else showToast(data.error ?? `${label} failed`);
    setActionLoading("");
  }

  async function doCancel() {
    setActionLoading("cancel");
    const res = await fetch(`/api/admin/bookings/${id}/cancel`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: cancelReason }),
    });
    const data = await res.json();
    if (data.success) { showToast(data.message); setShowCancel(false); load(); }
    else showToast(data.error ?? "Cancel failed");
    setActionLoading("");
  }

  if (loading) return <div className="p-6 text-center text-gray-400">Loading…</div>;
  if (!booking) return <div className="p-6 text-center text-gray-400">Booking not found</div>;

  const subtotal = booking.totalAmount - (booking.cgstAmount ?? 0) - (booking.sgstAmount ?? 0) + booking.discountAmount;

  return (
    <div className="p-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/admin/bookings" className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-gray-900 font-mono">{booking.bookingNumber}</h1>
              <StatusBadge status={booking.status} />
              <StatusBadge status={booking.paymentStatus} />
            </div>
            <p className="text-sm text-gray-500 mt-0.5">Created {fmtTime(booking.createdAt)}</p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          {booking.status === "confirmed" && (
            <button
              onClick={() => doAction("checkin", "Check in")}
              disabled={!!actionLoading}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {actionLoading === "checkin" ? "…" : "Check In"}
            </button>
          )}
          {booking.status === "checked_in" && (
            <button
              onClick={() => doAction("checkout", "Check out")}
              disabled={!!actionLoading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {actionLoading === "checkout" ? "…" : "Check Out"}
            </button>
          )}
          {!["cancelled", "checked_out", "no_show"].includes(booking.status) && (
            <button
              onClick={() => setShowCancel(true)}
              className="px-4 py-2 border border-red-200 text-red-600 hover:bg-red-50 text-sm font-medium rounded-lg transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-5">
          {/* Guest + Room */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-medium text-gray-900 mb-4">Stay Details</h2>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div>
                <div className="text-gray-500 text-xs mb-0.5">Guest Name</div>
                <div className="font-medium text-gray-900">{booking.guestName}</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs mb-0.5">Phone</div>
                <div className="font-medium text-gray-900">{booking.guestPhone}</div>
              </div>
              {booking.guestEmail && (
                <div>
                  <div className="text-gray-500 text-xs mb-0.5">Email</div>
                  <div className="text-gray-700">{booking.guestEmail}</div>
                </div>
              )}
              <div>
                <div className="text-gray-500 text-xs mb-0.5">Room</div>
                <div className="font-medium text-gray-900">
                  {booking.room.roomNumber ? `#${booking.room.roomNumber} — ` : ""}{booking.room.name}
                </div>
              </div>
              <div>
                <div className="text-gray-500 text-xs mb-0.5">Check-in</div>
                <div className="font-medium text-gray-900">{fmt(booking.checkIn)}</div>
                {booking.actualCheckin && <div className="text-xs text-gray-400">Actual: {fmtTime(booking.actualCheckin)}</div>}
              </div>
              <div>
                <div className="text-gray-500 text-xs mb-0.5">Check-out</div>
                <div className="font-medium text-gray-900">{fmt(booking.checkOut)}</div>
                {booking.actualCheckout && <div className="text-xs text-gray-400">Actual: {fmtTime(booking.actualCheckout)}</div>}
              </div>
              <div>
                <div className="text-gray-500 text-xs mb-0.5">Duration</div>
                <div className="font-medium text-gray-900">{booking.nights} night{booking.nights !== 1 ? "s" : ""}</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs mb-0.5">Guests</div>
                <div className="font-medium text-gray-900">{booking.adults} adults{booking.children > 0 ? `, ${booking.children} children` : ""}</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs mb-0.5">Source</div>
                <div className="text-gray-700 capitalize">{booking.source.replace(/_/g, " ")}</div>
              </div>
              {booking.extraBed && (
                <div><div className="text-gray-500 text-xs mb-0.5">Extra Bed</div><div className="text-gray-700">Yes</div></div>
              )}
            </div>
            {booking.specialRequests && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="text-xs text-gray-500 mb-1">Special Requests</div>
                <div className="text-sm text-gray-700">{booking.specialRequests}</div>
              </div>
            )}
            {booking.status === "cancelled" && (
              <div className="mt-4 pt-4 border-t border-red-100 bg-red-50 rounded-lg p-3">
                <div className="text-xs text-red-500 mb-1">Cancellation Details</div>
                <div className="text-sm text-red-700">
                  Cancelled on {fmtTime(booking.cancelledAt!)}
                  {booking.cancellationReason && ` · ${booking.cancellationReason}`}
                  {booking.refundAmount ? ` · Refund: ${fmtCurrency(booking.refundAmount)}` : ""}
                </div>
              </div>
            )}
          </div>

          {/* Payment history */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-medium text-gray-900 mb-4">Payment History</h2>
            {booking.payments.length === 0 ? (
              <p className="text-sm text-gray-400">No payments recorded</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                    <th className="pb-2 font-medium">Date</th>
                    <th className="pb-2 font-medium">Method</th>
                    <th className="pb-2 font-medium">Type</th>
                    <th className="pb-2 font-medium text-right">Amount</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {booking.payments.map((p) => (
                    <tr key={p.id}>
                      <td className="py-2 text-gray-600">{fmtTime(p.createdAt)}</td>
                      <td className="py-2 text-gray-600 capitalize">{p.paymentMethod}</td>
                      <td className="py-2 text-gray-600 capitalize">{p.paymentType.replace(/_/g, " ")}</td>
                      <td className="py-2 text-right font-medium text-gray-900">{fmtCurrency(p.amount)}</td>
                      <td className="py-2"><StatusBadge status={p.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right column: pricing */}
        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-medium text-gray-900 mb-4">Pricing Breakdown</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-700">
                <span>Room × {booking.nights}N</span>
                <span>{fmtCurrency(subtotal + booking.discountAmount)}</span>
              </div>
              {booking.discountAmount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Discount</span>
                  <span>−{fmtCurrency(booking.discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-gray-700">
                <span>Subtotal</span>
                <span>{fmtCurrency(subtotal)}</span>
              </div>
              {booking.cgstAmount != null && (
                <>
                  <div className="flex justify-between text-gray-500 text-xs">
                    <span>CGST</span>
                    <span>{fmtCurrency(booking.cgstAmount)}</span>
                  </div>
                  <div className="flex justify-between text-gray-500 text-xs">
                    <span>SGST</span>
                    <span>{fmtCurrency(booking.sgstAmount ?? 0)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between font-semibold text-gray-900 text-base pt-2 border-t border-gray-100">
                <span>Total</span>
                <span>{fmtCurrency(booking.totalAmount)}</span>
              </div>
            </div>
          </div>

          {/* Razorpay info */}
          {booking.razorpayOrderId && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-medium text-gray-900 mb-3">Razorpay</h2>
              <div className="text-xs space-y-1.5 text-gray-600 font-mono break-all">
                <div><span className="text-gray-400">Order: </span>{booking.razorpayOrderId}</div>
                {booking.razorpayPaymentId && (
                  <div><span className="text-gray-400">Payment: </span>{booking.razorpayPaymentId}</div>
                )}
              </div>
            </div>
          )}

          {/* Invoices */}
          {booking.invoices.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-medium text-gray-900 mb-3">Invoices</h2>
              {booking.invoices.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between text-sm">
                  <span className="font-mono text-primary">{inv.invoiceNumber}</span>
                  <StatusBadge status={inv.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Toast */}
      <Toast message={toast} />

      {/* Cancel modal */}
      {showCancel && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setShowCancel(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
              <h2 className="font-semibold text-gray-900 mb-1">Cancel Booking</h2>
              <p className="text-sm text-gray-500 mb-4">This action cannot be undone.</p>
              <label htmlFor={`${fieldId}-reason-optional`} className="block text-sm font-medium text-gray-700 mb-1">Reason (optional)</label>
              <textarea id={`${fieldId}-reason-optional`}
                rows={3}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-400 resize-none mb-4"
                placeholder="Guest request, duplicate booking…"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => setShowCancel(false)}
                  className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
                >
                  Keep
                </button>
                <button
                  onClick={doCancel}
                  disabled={actionLoading === "cancel"}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                >
                  {actionLoading === "cancel" ? "Cancelling…" : "Confirm Cancel"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
