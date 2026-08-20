"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useToast, Toast } from "@/components/ui/Toast";
import { WalkInModal } from "@/components/admin/WalkInModal";

type Booking = {
  id: string;
  bookingNumber: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  totalAmount: number;
  status: string;
  paymentStatus: string;
  source: string;
  room: { name: string; roomNumber?: string };
  createdAt: string;
};

const STATUS_COLOR: Record<string, string> = {
  confirmed: "bg-blue-100 text-blue-700",
  checked_in: "bg-green-100 text-green-700",
  checked_out: "bg-gray-100 text-gray-600",
  cancelled: "bg-red-100 text-red-600",
  no_show: "bg-orange-100 text-orange-700",
};

const PAY_COLOR: Record<string, string> = {
  paid: "bg-green-100 text-green-700",
  pending: "bg-yellow-100 text-yellow-700",
  cash: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-600",
  refunded: "bg-purple-100 text-purple-700",
};

const SOURCE_LABEL: Record<string, string> = {
  website: "Website",
  walkin: "Walk-in",
  phone: "Phone",
  booking_com: "Booking.com",
  mmt: "MMT",
  goibibo: "Goibibo",
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { toast, showToast } = useToast();

  // Filters
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [showWalkIn, setShowWalkIn] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (status !== "all") params.set("status", status);
    if (source !== "all") params.set("source", source);
    if (search) params.set("search", search);
    const res = await fetch(`/api/admin/bookings?${params}`);
    const data = await res.json();
    if (data.success) {
      setBookings(data.data.bookings);
      setTotal(data.data.total);
    }
    setLoading(false);
  }, [page, status, source, search]);

  useEffect(() => { load(); }, [load]);


  async function doAction(id: string, action: "checkin" | "checkout" | "cancel") {
    setActionLoading(id + action);
    try {
      const res = await fetch(`/api/admin/bookings/${id}/${action}`, { method: "PATCH" });
      const data = await res.json();
      if (data.success) {
        showToast(data.message);
        load();
      } else {
        showToast(data.error ?? "Action failed");
      }
    } finally {
      setActionLoading(null);
    }
  }

  const pageCount = Math.ceil(total / 25);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Bookings</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} total</p>
        </div>
        <button
          onClick={() => setShowWalkIn(true)}
          className="flex items-center gap-2 px-4 py-2 btn-admin"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Walk-in Booking
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5 p-4 bg-white rounded-xl border border-gray-200">
        <input
          type="text"
          placeholder="Search name, phone, booking#…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { setSearch(searchInput); setPage(1); }
          }}
          className="flex-1 min-w-40 text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white"
        >
          <option value="all">All Status</option>
          <option value="confirmed">Confirmed</option>
          <option value="checked_in">Checked In</option>
          <option value="checked_out">Checked Out</option>
          <option value="cancelled">Cancelled</option>
          <option value="no_show">No Show</option>
        </select>
        <select
          value={source}
          onChange={(e) => { setSource(e.target.value); setPage(1); }}
          className="text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white"
        >
          <option value="all">All Sources</option>
          {Object.entries(SOURCE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <button
          onClick={() => { setSearch(searchInput); setPage(1); }}
          className="px-3 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-600 transition-colors"
        >
          Search
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Booking #</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Guest</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Room</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Dates</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Amount</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Payment</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Source</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-gray-400">Loading…</td>
                </tr>
              ) : bookings.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-gray-400">No bookings found</td>
                </tr>
              ) : (
                bookings.map((b) => (
                  <tr key={b.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={`/admin/bookings/${b.id}`} className="font-mono text-primary hover:underline">
                        {b.bookingNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{b.guestName}</div>
                      <div className="text-xs text-gray-500">{b.guestPhone}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {b.room.roomNumber ? `#${b.room.roomNumber} ` : ""}{b.room.name}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <div>{fmtDate(b.checkIn)}</div>
                      <div className="text-xs text-gray-400">{b.nights}N → {fmtDate(b.checkOut)}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {fmtCurrency(b.totalAmount)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLOR[b.status] ?? "bg-gray-100 text-gray-600"}`}>
                        {b.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${PAY_COLOR[b.paymentStatus] ?? "bg-gray-100 text-gray-600"}`}>
                        {b.paymentStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {SOURCE_LABEL[b.source] ?? b.source}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Link
                          href={`/admin/bookings/${b.id}`}
                          className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                        >
                          View
                        </Link>
                        {b.status === "confirmed" && (
                          <button
                            onClick={() => doAction(b.id, "checkin")}
                            disabled={actionLoading === b.id + "checkin"}
                            className="px-2 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded transition-colors disabled:opacity-50"
                          >
                            Check In
                          </button>
                        )}
                        {b.status === "checked_in" && (
                          <button
                            onClick={() => doAction(b.id, "checkout")}
                            disabled={actionLoading === b.id + "checkout"}
                            className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors disabled:opacity-50"
                          >
                            Check Out
                          </button>
                        )}
                        {!["cancelled", "checked_out", "no_show"].includes(b.status) && (
                          <button
                            onClick={() => { if (confirm("Cancel this booking?")) doAction(b.id, "cancel"); }}
                            disabled={actionLoading === b.id + "cancel"}
                            className="px-2 py-1 text-xs bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded transition-colors disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pageCount > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <span className="text-xs text-gray-500">Page {page} of {pageCount}</span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={page === pageCount}
                className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Toast */}
      <Toast message={toast} />

      {/* Walk-in modal */}
      {showWalkIn && <WalkInModal onClose={() => { setShowWalkIn(false); load(); }} />}
    </div>
  );
}
