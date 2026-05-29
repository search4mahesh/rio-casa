"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type AuditBooking = {
  id: string; bookingNumber: string; guestName: string; guestPhone: string;
  checkIn: string; checkOut: string; nights: number; totalAmount: number;
  status: string; paymentStatus: string;
  room: { name: string; roomNumber?: string | null; roomType: string };
};

type Summary = {
  date: string;
  arrivals: AuditBooking[];
  departures: AuditBooking[];
  noShows: AuditBooking[];
  inHouse: AuditBooking[];
  todayRevenue: number;
};

type AuditResult = { noShowsMarked: number; arrivalsFlagged: number; departuresFlagged: number };

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function fmtShort(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function KPICard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className={`bg-white rounded-xl border-2 ${color} p-5`}>
      <div className="text-3xl font-bold text-gray-900">{value}</div>
      <div className="text-sm font-semibold text-gray-700 mt-1">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function BookingTable({ bookings, emptyMsg }: { bookings: AuditBooking[]; emptyMsg: string }) {
  if (bookings.length === 0) return (
    <div className="text-center py-8 text-gray-400 text-sm">{emptyMsg}</div>
  );
  return (
    <table className="min-w-full text-sm">
      <thead>
        <tr className="border-b border-gray-100 bg-gray-50">
          <th className="text-left px-4 py-2.5 font-medium text-gray-500">Guest</th>
          <th className="text-left px-4 py-2.5 font-medium text-gray-500">Room</th>
          <th className="text-left px-4 py-2.5 font-medium text-gray-500">Booking #</th>
          <th className="text-left px-4 py-2.5 font-medium text-gray-500">Check-in</th>
          <th className="text-left px-4 py-2.5 font-medium text-gray-500">Check-out</th>
          <th className="text-left px-4 py-2.5 font-medium text-gray-500">Amount</th>
          <th className="px-4 py-2.5" />
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {bookings.map((b) => (
          <tr key={b.id} className="hover:bg-gray-50">
            <td className="px-4 py-3">
              <div className="font-medium text-gray-900">{b.guestName}</div>
              <div className="text-xs text-gray-400">{b.guestPhone}</div>
            </td>
            <td className="px-4 py-3">
              <div>{b.room.roomNumber ? `#${b.room.roomNumber}` : b.room.name}</div>
              <div className="text-xs text-gray-400 capitalize">{b.room.roomType}</div>
            </td>
            <td className="px-4 py-3 font-mono text-xs text-gray-500">{b.bookingNumber}</td>
            <td className="px-4 py-3 text-gray-600">{fmtShort(b.checkIn)}</td>
            <td className="px-4 py-3 text-gray-600">{fmtShort(b.checkOut)}</td>
            <td className="px-4 py-3 font-medium text-gray-800">₹{b.totalAmount.toLocaleString("en-IN")}</td>
            <td className="px-4 py-3">
              <Link href={`/admin/bookings/${b.id}`}
                className="px-2.5 py-1 text-xs text-[#4A6741] border border-[#4A6741]/30 rounded-lg hover:bg-[#4A6741]/5 transition-colors">
                View
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function NightAuditPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [toast, setToast] = useState("");
  const [activeTab, setActiveTab] = useState<"arrivals" | "departures" | "inHouse" | "noShows">("arrivals");

  async function loadSummary() {
    setLoading(true);
    const res = await fetch("/api/admin/night-audit/summary");
    const data = await res.json();
    if (data.success) setSummary(data.summary);
    setLoading(false);
  }

  useEffect(() => { loadSummary(); }, []);

  async function runAudit() {
    setRunning(true);
    const res = await fetch("/api/admin/night-audit/run", { method: "POST" });
    const data = await res.json();
    if (data.success) {
      setResult(data.result);
      setToast(`Audit complete — ${data.result.noShowsMarked} no-show${data.result.noShowsMarked !== 1 ? "s" : ""} marked`);
      setTimeout(() => setToast(""), 4000);
      await loadSummary();
    } else {
      setToast(data.error ?? "Audit failed");
      setTimeout(() => setToast(""), 4000);
    }
    setRunning(false);
  }

  const todayLabel = summary?.date ? fmtDate(summary.date) : new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const TABS = [
    { key: "arrivals",   label: "Arrivals",   count: summary?.arrivals.length ?? 0,   color: "text-blue-600" },
    { key: "departures", label: "Departures", count: summary?.departures.length ?? 0,  color: "text-orange-600" },
    { key: "inHouse",    label: "In House",   count: summary?.inHouse.length ?? 0,     color: "text-[#4A6741]" },
    { key: "noShows",    label: "No Shows",   count: summary?.noShows.length ?? 0,     color: "text-red-600" },
  ] as const;

  return (
    <div className="p-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Night Audit</h1>
          <p className="text-sm text-gray-500 mt-0.5">{todayLabel}</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={loadSummary} className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1.5 transition-colors">
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
          <button onClick={runAudit} disabled={running}
            className="flex items-center gap-2 px-4 py-2 bg-[#4A6741] hover:bg-[#3d5636] disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {running ? "Running…" : "Run Night Audit"}
          </button>
        </div>
      </div>

      {/* Audit result banner */}
      {result && (
        <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl mb-6">
          <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-sm text-green-800">
            <span className="font-semibold">Audit complete.</span>{" "}
            {result.noShowsMarked} booking{result.noShowsMarked !== 1 ? "s" : ""} marked as no-show ·{" "}
            {result.arrivalsFlagged} room{result.arrivalsFlagged !== 1 ? "s" : ""} flagged for today's arrivals ·{" "}
            {result.departuresFlagged} room{result.departuresFlagged !== 1 ? "s" : ""} flagged for due checkout
          </div>
          <button onClick={() => setResult(null)} className="ml-auto text-green-400 hover:text-green-600">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-20 text-gray-400">Loading…</div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <KPICard label="Arrivals Today" value={summary?.arrivals.length ?? 0} color="border-blue-200" />
            <KPICard label="Departures" value={summary?.departures.length ?? 0} color="border-orange-200" />
            <KPICard label="In House" value={summary?.inHouse.length ?? 0} sub="currently checked in" color="border-green-200" />
            <KPICard label="No Shows" value={summary?.noShows.length ?? 0} sub="missed check-in" color={summary?.noShows.length ? "border-red-300" : "border-gray-200"} />
            <KPICard label="Today's Revenue" value={`₹${(summary?.todayRevenue ?? 0).toLocaleString("en-IN")}`} sub="paid bookings" color="border-amber-200" />
          </div>

          {/* Tabs */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex border-b border-gray-200">
              {TABS.map((tab) => (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.key
                      ? `border-[#4A6741] ${tab.color}`
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}>
                  {tab.label}
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                    tab.count > 0 ? "bg-gray-100 text-gray-600" : "bg-gray-50 text-gray-400"
                  }`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
            <div>
              {activeTab === "arrivals" && (
                <BookingTable bookings={summary?.arrivals ?? []} emptyMsg="No arrivals scheduled for today" />
              )}
              {activeTab === "departures" && (
                <BookingTable bookings={summary?.departures ?? []} emptyMsg="No departures expected today" />
              )}
              {activeTab === "inHouse" && (
                <BookingTable bookings={summary?.inHouse ?? []} emptyMsg="No guests currently checked in" />
              )}
              {activeTab === "noShows" && (
                <BookingTable bookings={summary?.noShows ?? []} emptyMsg="No no-shows — all guests arrived on time" />
              )}
            </div>
          </div>
        </>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 bg-gray-900 text-white text-sm px-4 py-3 rounded-lg shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
