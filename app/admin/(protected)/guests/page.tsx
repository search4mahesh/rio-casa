"use client";

import { useEffect, useState, useCallback } from "react";

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

type GuestDetail = Guest & {
  address?: string;
  pincode?: string;
  idProofType?: string;
  gstin?: string;
  companyName?: string;
  notes?: string;
  bookings: {
    id: string;
    bookingNumber: string;
    checkIn: string;
    checkOut: string;
    nights: number;
    totalAmount: number;
    status: string;
    paymentStatus: string;
    room: { name: string; roomNumber?: string };
  }[];
};

const STATUS_COLOR: Record<string, string> = {
  confirmed: "bg-blue-100 text-blue-700",
  checked_in: "bg-green-100 text-green-700",
  checked_out: "bg-gray-100 text-gray-600",
  cancelled: "bg-red-100 text-red-600",
  no_show: "bg-orange-100 text-orange-700",
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
  const [selected, setSelected] = useState<GuestDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (search) params.set("search", search);
    const res = await fetch(`/api/admin/guests?${params}`);
    const data = await res.json();
    if (data.success) { setGuests(data.guests); setTotal(data.total); }
    setLoading(false);
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  async function openGuest(id: string) {
    setDetailLoading(true);
    setSelected(null);
    const res = await fetch(`/api/admin/guests/${id}`);
    const data = await res.json();
    if (data.success) setSelected(data.guest);
    setDetailLoading(false);
  }

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
          className="flex-1 text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4A6741]"
        />
        <button
          onClick={() => { setSearch(searchInput); setPage(1); }}
          className="px-4 py-2 text-sm bg-[#4A6741] text-white rounded-lg hover:bg-[#3d5636] transition-colors"
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
                    <div className="font-medium text-gray-900">{g.firstName} {g.lastName}</div>
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
                    <button
                      onClick={() => openGuest(g.id)}
                      className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                    >
                      View
                    </button>
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

      {/* Detail slide-over */}
      {(detailLoading || selected) && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setSelected(null)} />
          <div className="fixed right-0 top-0 bottom-0 z-50 w-[420px] bg-white shadow-xl flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-semibold text-gray-900">
                {selected ? `${selected.firstName} ${selected.lastName}` : "Loading…"}
              </h2>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {detailLoading ? (
              <div className="flex-1 flex items-center justify-center text-gray-400">Loading…</div>
            ) : selected && (
              <div className="flex-1 overflow-auto p-5 space-y-6">
                {/* Contact */}
                <section>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Contact</h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><span className="text-gray-500">Phone</span><div className="font-medium">{selected.phone}</div></div>
                    <div><span className="text-gray-500">Email</span><div className="font-medium">{selected.email || "—"}</div></div>
                    <div><span className="text-gray-500">City</span><div className="font-medium">{selected.city || "—"}</div></div>
                    <div><span className="text-gray-500">State</span><div className="font-medium">{selected.state || "—"}</div></div>
                    {selected.address && (
                      <div className="col-span-2"><span className="text-gray-500">Address</span><div className="font-medium">{selected.address}</div></div>
                    )}
                  </div>
                </section>

                {/* Stats */}
                <section>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Stay History</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gray-50 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-[#4A6741]">{selected.totalStays}</div>
                      <div className="text-xs text-gray-500">Total Stays</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 text-center">
                      <div className="text-xl font-bold text-gray-900">{fmtCurrency(selected.totalRevenue)}</div>
                      <div className="text-xs text-gray-500">Total Revenue</div>
                    </div>
                  </div>
                </section>

                {/* Bookings */}
                {selected.bookings.length > 0 && (
                  <section>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Bookings</h3>
                    <div className="space-y-2">
                      {selected.bookings.map((b) => (
                        <a key={b.id} href={`/admin/bookings/${b.id}`}
                          className="block p-3 border border-gray-200 rounded-lg hover:border-[#4A6741] transition-colors">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-mono text-xs text-[#4A6741]">{b.bookingNumber}</span>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[b.status] ?? "bg-gray-100 text-gray-600"}`}>
                              {b.status.replace("_", " ")}
                            </span>
                          </div>
                          <div className="text-sm text-gray-700">{b.room.name}</div>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-xs text-gray-500">{fmtDate(b.checkIn)} → {fmtDate(b.checkOut)} ({b.nights}N)</span>
                            <span className="text-sm font-medium">{fmtCurrency(b.totalAmount)}</span>
                          </div>
                        </a>
                      ))}
                    </div>
                  </section>
                )}

                {selected.notes && (
                  <section>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Notes</h3>
                    <p className="text-sm text-gray-600 bg-yellow-50 p-3 rounded-lg">{selected.notes}</p>
                  </section>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
