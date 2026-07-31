"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type Guest = {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone: string;
  city?: string;
  state?: string;
  nationality: string;
  totalStays: number;
  totalRevenue: string;
  createdAt: string;
};

function fmtCurrency(n: number | string) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n));
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
}

export default function GuestsPage() {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (search) params.set("search", search);
    const res = await fetch(`/api/admin/guests?${params}`);
    const data = await res.json();
    if (data.success) { setGuests(data.data.guests); setTotal(data.data.total); }
    setLoading(false);
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  const pageCount = Math.ceil(total / 25);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Guests</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} total guests</p>
        </div>
      </div>

      {/* Search */}
      <div className="flex gap-3 mb-5">
        <input
          type="text"
          placeholder="Search by name, phone or email…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { setSearch(searchInput); setPage(1); } }}
          className="flex-1 text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          onClick={() => { setSearch(searchInput); setPage(1); }}
          className="px-4 py-2 btn-admin"
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
                <th className="text-left px-4 py-3 font-medium text-gray-600">Guest</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Phone</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Location</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Stays</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Total Revenue</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Since</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={7} className="py-12 text-center text-gray-400">Loading…</td></tr>
              ) : guests.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-gray-400">No guests found</td></tr>
              ) : guests.map((g) => (
                <tr key={g.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/admin/guests/${g.id}`} className="font-medium text-gray-900 hover:text-primary hover:underline">
                      {g.firstName} {g.lastName}
                    </Link>
                    {g.email && <div className="text-xs text-gray-500">{g.email}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{g.phone}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {[g.city, g.state].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-700">{g.totalStays}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">{fmtCurrency(g.totalRevenue)}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{fmtDate(g.createdAt)}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/guests/${g.id}`}
                      className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 transition-colors inline-block"
                    >
                      Open
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
      </div>
    </div>
  );
}
