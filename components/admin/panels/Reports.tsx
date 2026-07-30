"use client";

import { useEffect, useState, useCallback } from "react";

type Report = {
  from: string;
  to: string;
  daysInRange: number;
  activeRoomCount: number;
  kpi: {
    occupancyRate: number; adr: number; revpar: number;
    totalRevenue: number; totalBookings: number; totalGuests: number;
    avgLOS: number; occupiedNights: number; totalAvailableNights: number;
  };
  monthlySeries: { month: string; revenue: number; bookings: number; occupied: number; occupancyPct: number }[];
  sourceBreakdown: { source: string; bookings: number; revenue: number; pct: number }[];
  roomTypeBreakdown: { roomType: string; bookings: number; revenue: number; pct: number }[];
};

const SOURCE_LABEL: Record<string, string> = {
  website: "Website", walkin: "Walk-in", phone: "Phone",
  booking_com: "Booking.com", mmt: "MakeMyTrip", agoda: "Agoda", airbnb: "Airbnb",
};

const ROOM_TYPE_LABEL: Record<string, string> = {
  deluxe: "Deluxe", premium: "Premium", family: "Family", standard: "Standard",
};

const SOURCE_COLOR: Record<string, string> = {
  website: "bg-[#4A6741]", walkin: "bg-amber-500", phone: "bg-blue-500",
  booking_com: "bg-blue-700", mmt: "bg-orange-500", agoda: "bg-red-500",
  airbnb: "bg-pink-500", other: "bg-gray-400",
};

const ROOM_TYPE_COLOR: Record<string, string> = {
  deluxe: "bg-[#4A6741]", premium: "bg-amber-500", family: "bg-blue-500", standard: "bg-gray-500",
};

function fmtINR(n: number) {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n).replace(/^/, "₹");
}

function fmtMonth(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}

function todayISO(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().split("T")[0];
}

function firstOfMonth() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().split("T")[0];
}

function firstOfYear() {
  return `${new Date().getFullYear()}-01-01`;
}

function exportCSV(report: Report) {
  const rows: string[] = [];
  rows.push(`"Rio Casa Resort — Performance Report"`);
  rows.push(`"Period","${report.from.split("T")[0]} to ${report.to.split("T")[0]} (${report.daysInRange} days)"`);
  rows.push("");
  rows.push(`"KPI","Value"`);
  rows.push(`"Occupancy Rate","${report.kpi.occupancyRate}%"`);
  rows.push(`"ADR","₹${report.kpi.adr}"`);
  rows.push(`"RevPAR","₹${report.kpi.revpar}"`);
  rows.push(`"Total Revenue","₹${report.kpi.totalRevenue}"`);
  rows.push(`"Total Bookings","${report.kpi.totalBookings}"`);
  rows.push(`"Total Guests","${report.kpi.totalGuests}"`);
  rows.push(`"Avg Length of Stay","${report.kpi.avgLOS} nights"`);
  rows.push("");
  rows.push(`"Month","Revenue","Bookings","Occupied Nights","Occupancy %"`);
  for (const m of report.monthlySeries) {
    rows.push(`"${m.month}","${m.revenue}","${m.bookings}","${m.occupied}","${m.occupancyPct.toFixed(1)}"`);
  }
  rows.push("");
  rows.push(`"Source","Bookings","Revenue","Share %"`);
  for (const s of report.sourceBreakdown) {
    rows.push(`"${s.source}","${s.bookings}","${s.revenue}","${s.pct.toFixed(1)}"`);
  }

  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rio-casa-report-${report.from.split("T")[0]}-to-${report.to.split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function KPICard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className={`bg-white rounded-xl border-2 ${accent ?? "border-gray-200"} p-4`}>
      <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold text-gray-900 mt-1">{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function ReportsPanel() {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 11); d.setDate(1);
    return d.toISOString().split("T")[0];
  });
  const [to, setTo] = useState(todayISO());

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/reports?from=${from}&to=${to}`);
    const data = await res.json();
    if (data.success) setReport(data.report);
    setLoading(false);
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  function applyPreset(preset: "this-month" | "last-month" | "this-year" | "last-12") {
    if (preset === "this-month") { setFrom(firstOfMonth()); setTo(todayISO()); return; }
    if (preset === "last-month") {
      const d = new Date(); d.setMonth(d.getMonth() - 1, 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      setFrom(d.toISOString().split("T")[0]); setTo(end.toISOString().split("T")[0]);
      return;
    }
    if (preset === "this-year") { setFrom(firstOfYear()); setTo(todayISO()); return; }
    const d = new Date(); d.setMonth(d.getMonth() - 11); d.setDate(1);
    setFrom(d.toISOString().split("T")[0]); setTo(todayISO());
  }

  const maxRevenue = Math.max(1, ...(report?.monthlySeries.map((m) => m.revenue) ?? [1]));
  const maxOccupancy = Math.max(1, ...(report?.monthlySeries.map((m) => m.occupancyPct) ?? [1]));

  return (
    <div className="p-6 max-w-7xl">
      <div className="flex items-center justify-end gap-3 mb-6">
        <button onClick={() => report && exportCSV(report)} disabled={!report}
          className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors">
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export CSV
        </button>
      </div>

      {/* Date filter */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} max={to}
              className="text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4A6741]" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} min={from}
              className="text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4A6741]" />
          </div>
          <div className="flex gap-1 ml-auto">
            <button onClick={() => applyPreset("this-month")} className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">This Month</button>
            <button onClick={() => applyPreset("last-month")} className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">Last Month</button>
            <button onClick={() => applyPreset("this-year")} className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">This Year</button>
            <button onClick={() => applyPreset("last-12")} className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">Last 12 Months</button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-400">Loading report…</div>
      ) : !report ? (
        <div className="text-center py-20 text-gray-400">No data</div>
      ) : (
        <>
          {/* KPI Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <KPICard label="Occupancy Rate" value={`${report.kpi.occupancyRate}%`} sub={`${report.kpi.occupiedNights} / ${report.kpi.totalAvailableNights} nights`} accent="border-[#4A6741]" />
            <KPICard label="ADR" value={fmtINR(report.kpi.adr)} sub="Avg Daily Rate" accent="border-amber-300" />
            <KPICard label="RevPAR" value={fmtINR(report.kpi.revpar)} sub="Revenue per available room" accent="border-blue-300" />
            <KPICard label="Total Revenue" value={fmtINR(report.kpi.totalRevenue)} sub={`${report.daysInRange} days`} accent="border-green-300" />
            <KPICard label="Total Bookings" value={String(report.kpi.totalBookings)} sub={`${report.kpi.totalGuests} guests`} />
            <KPICard label="Avg Length of Stay" value={`${report.kpi.avgLOS} N`} sub="per booking" />
            <KPICard label="Active Rooms" value={String(report.activeRoomCount)} />
            <KPICard label="Period" value={`${report.daysInRange} days`} sub={`${report.from.split("T")[0]} → ${report.to.split("T")[0]}`} />
          </div>

          {/* Monthly Occupancy Bar Chart */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Monthly Occupancy %</h2>
            <div className="flex items-end gap-2 h-48">
              {report.monthlySeries.map((m) => {
                const h = (m.occupancyPct / Math.max(maxOccupancy, 1)) * 100;
                return (
                  <div key={m.month} className="flex-1 flex flex-col items-center justify-end group">
                    <div className="text-xs font-semibold text-gray-700 mb-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {m.occupancyPct.toFixed(0)}%
                    </div>
                    <div className="w-full bg-[#4A6741] rounded-t-md transition-all hover:bg-[#3d5636]"
                      style={{ height: `${Math.max(2, h)}%` }} title={`${fmtMonth(m.month)}: ${m.occupancyPct.toFixed(1)}%`} />
                    <div className="text-[10px] text-gray-500 mt-1.5 truncate w-full text-center">{fmtMonth(m.month)}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Monthly Revenue Line/Bar Chart */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Monthly Revenue</h2>
            <div className="flex items-end gap-2 h-48">
              {report.monthlySeries.map((m) => {
                const h = (m.revenue / maxRevenue) * 100;
                return (
                  <div key={m.month} className="flex-1 flex flex-col items-center justify-end group">
                    <div className="text-xs font-semibold text-gray-700 mb-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {fmtINR(m.revenue)}
                    </div>
                    <div className="w-full bg-amber-500 rounded-t-md transition-all hover:bg-amber-600"
                      style={{ height: `${Math.max(2, h)}%` }} title={`${fmtMonth(m.month)}: ${fmtINR(m.revenue)}`} />
                    <div className="text-[10px] text-gray-500 mt-1.5 truncate w-full text-center">{fmtMonth(m.month)}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Two-column: Source + Room Type breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Source breakdown */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">Booking Source</h2>
              {report.sourceBreakdown.length === 0 ? (
                <div className="text-center py-8 text-sm text-gray-400">No bookings in this period</div>
              ) : (
                <div className="space-y-3">
                  {report.sourceBreakdown.map((s) => (
                    <div key={s.source}>
                      <div className="flex items-center justify-between mb-1 text-sm">
                        <span className="text-gray-700">{SOURCE_LABEL[s.source] ?? s.source}</span>
                        <span className="text-gray-500 text-xs">{s.bookings} · {fmtINR(s.revenue)}</span>
                      </div>
                      <div className="h-6 bg-gray-100 rounded-lg overflow-hidden relative">
                        <div className={`h-full ${SOURCE_COLOR[s.source] ?? "bg-gray-500"} flex items-center justify-end pr-2 text-xs font-medium text-white`}
                          style={{ width: `${Math.max(8, s.pct)}%` }}>
                          {s.pct.toFixed(0)}%
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Room type breakdown */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">Revenue by Room Type</h2>
              {report.roomTypeBreakdown.length === 0 ? (
                <div className="text-center py-8 text-sm text-gray-400">No bookings in this period</div>
              ) : (
                <div className="space-y-3">
                  {report.roomTypeBreakdown.map((rt) => (
                    <div key={rt.roomType}>
                      <div className="flex items-center justify-between mb-1 text-sm">
                        <span className="text-gray-700 capitalize">{ROOM_TYPE_LABEL[rt.roomType] ?? rt.roomType}</span>
                        <span className="text-gray-500 text-xs">{rt.bookings} bookings · {fmtINR(rt.revenue)}</span>
                      </div>
                      <div className="h-6 bg-gray-100 rounded-lg overflow-hidden relative">
                        <div className={`h-full ${ROOM_TYPE_COLOR[rt.roomType] ?? "bg-gray-500"} flex items-center justify-end pr-2 text-xs font-medium text-white`}
                          style={{ width: `${Math.max(8, rt.pct)}%` }}>
                          {rt.pct.toFixed(0)}%
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
