"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type Invoice = {
  id: string;
  invoiceNumber: string;
  guestName: string;
  guestGstin?: string;
  totalAmount: string;
  cgstAmount?: string;
  sgstAmount?: string;
  status: string;
  invoiceDate: string;
  createdAt: string;
  booking: { bookingNumber: string };
};

const STATUS_COLOR: Record<string, string> = {
  generated: "bg-blue-100 text-blue-700",
  sent:       "bg-green-100 text-green-700",
  cancelled:  "bg-red-100 text-red-600",
};

function fmtCurrency(n: string | number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n));
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function InvoicesPanel() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (search) params.set("search", search);
    if (statusFilter !== "all") params.set("status", statusFilter);
    const res = await fetch(`/api/admin/invoices?${params}`);
    const data = await res.json();
    if (data.success) { setInvoices(data.data.invoices); setTotal(data.data.total); }
    setLoading(false);
  }, [page, search, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const pageCount = Math.ceil(total / 25);

  return (
    <div className="p-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <input
          type="text"
          placeholder="Search invoice # or guest name…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { setSearch(searchInput); setPage(1); } }}
          className="flex-1 min-w-48 text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white"
        >
          <option value="all">All Status</option>
          <option value="generated">Generated</option>
          <option value="sent">Sent</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button
          onClick={() => { setSearch(searchInput); setPage(1); }}
          className="px-4 py-2 btn-admin"
        >
          Search
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-gray-400">Loading…</div>
        ) : invoices.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-5xl mb-4">🧾</div>
            <p className="text-gray-500 font-medium">No invoices yet</p>
            <p className="text-sm text-gray-400 mt-1">Invoices are generated when bookings are completed and paid.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Invoice #</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Booking #</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Guest</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">CGST</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">SGST</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Total</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-primary font-medium">{inv.invoiceNumber}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{inv.booking.bookingNumber}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{inv.guestName}</div>
                        {inv.guestGstin && <div className="text-xs text-gray-400">GSTIN: {inv.guestGstin}</div>}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">{inv.cgstAmount ? fmtCurrency(inv.cgstAmount) : "—"}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{inv.sgstAmount ? fmtCurrency(inv.sgstAmount) : "—"}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmtCurrency(inv.totalAmount)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLOR[inv.status] ?? "bg-gray-100 text-gray-600"}`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(inv.invoiceDate)}</td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/admin/invoices/${inv.id}/print`} target="_blank"
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-primary border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                          </svg>
                          Print
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pageCount > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
                <span className="text-xs text-gray-500">Page {page} of {pageCount}</span>
                <div className="flex gap-2">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                    className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40">Previous</button>
                  <button onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page === pageCount}
                    className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40">Next</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
