"use client";

import { useState, useEffect, useCallback } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

const CATEGORY_COLORS: Record<string, string> = {
  housekeeping: "bg-blue-500",
  maintenance:  "bg-orange-500",
  food:         "bg-green-500",
  utilities:    "bg-yellow-500",
  staff:        "bg-purple-500",
  marketing:    "bg-pink-500",
  other:        "bg-gray-400",
};

interface BySource { source: string; label: string; amount: number; bookings: number }
interface ByCategory { category: string; label: string; amount: number }
interface DailyRow { date: string; revenue: number; expenses: number }

interface ReconcData {
  month: string;
  revenue: { total: number; bySource: BySource[] };
  expenses: { total: number; byCategory: ByCategory[] };
  net: number;
  dailyBreakdown: DailyRow[];
}

function fmt(n: number) {
  return "₹" + Math.abs(n).toLocaleString("en-IN");
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
      <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function ReconciliationPage() {
  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth] = useState(currentMonth);
  const [data, setData] = useState<ReconcData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"summary" | "daily">("summary");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/reconciliation?month=${month}`);
    const json = await res.json();
    if (json.success) setData(json.data);
    setLoading(false);
  }, [month]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const monthLabel = new Date(month + "-02").toLocaleString("en-IN", { month: "long", year: "numeric" });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Reconciliation</h1>
          <p className="text-sm text-gray-500 mt-0.5">Money in vs money out</p>
        </div>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#4A6741]"
        />
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-20 text-sm">Loading…</div>
      ) : !data ? (
        <div className="text-center text-gray-400 py-20 text-sm">No data</div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Revenue</p>
                <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center">
                  <TrendingUp size={16} className="text-green-600" />
                </div>
              </div>
              <p className="text-2xl font-bold text-gray-900">{fmt(data.revenue.total)}</p>
              <p className="text-xs text-gray-400 mt-1">{monthLabel}</p>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Expenses</p>
                <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center">
                  <TrendingDown size={16} className="text-red-500" />
                </div>
              </div>
              <p className="text-2xl font-bold text-gray-900">{fmt(data.expenses.total)}</p>
              <p className="text-xs text-gray-400 mt-1">{monthLabel}</p>
            </div>

            <div className={`rounded-xl border shadow-sm p-5 ${data.net >= 0 ? "bg-green-50 border-green-100" : "bg-red-50 border-red-100"}`}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs uppercase tracking-wide font-medium text-gray-500">Net P&amp;L</p>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${data.net >= 0 ? "bg-green-100" : "bg-red-100"}`}>
                  <Minus size={16} className={data.net >= 0 ? "text-green-700" : "text-red-600"} />
                </div>
              </div>
              <p className={`text-2xl font-bold ${data.net >= 0 ? "text-green-700" : "text-red-600"}`}>
                {data.net >= 0 ? "+" : "−"}{fmt(data.net)}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {data.revenue.total > 0
                  ? `${Math.round(((data.revenue.total - data.expenses.total) / data.revenue.total) * 100)}% margin`
                  : "No revenue"}
              </p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-5 border-b border-gray-100">
            {(["summary", "daily"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
                  tab === t ? "border-[#4A6741] text-[#4A6741]" : "border-transparent text-gray-400 hover:text-gray-600"
                }`}
              >
                {t === "summary" ? "Summary" : "Day-by-Day"}
              </button>
            ))}
          </div>

          {tab === "summary" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Revenue breakdown */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                  Revenue by Source
                </h3>
                {data.revenue.bySource.length === 0 ? (
                  <p className="text-sm text-gray-400">No revenue this month</p>
                ) : (
                  <div className="space-y-3">
                    {data.revenue.bySource.map((s) => (
                      <div key={s.source}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-gray-600">{s.label}</span>
                          <span className="font-semibold text-gray-900">{fmt(s.amount)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Bar value={s.amount} max={data.revenue.total} color="bg-green-400" />
                          <span className="text-xs text-gray-400 w-16 text-right">{s.bookings} booking{s.bookings !== 1 ? "s" : ""}</span>
                        </div>
                      </div>
                    ))}
                    <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-sm font-semibold">
                      <span className="text-gray-700">Total Revenue</span>
                      <span className="text-green-700">{fmt(data.revenue.total)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Expense breakdown */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
                  Expenses by Category
                </h3>
                {data.expenses.byCategory.length === 0 ? (
                  <p className="text-sm text-gray-400">No expenses this month</p>
                ) : (
                  <div className="space-y-3">
                    {data.expenses.byCategory.map((c) => (
                      <div key={c.category}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-gray-600">{c.label}</span>
                          <span className="font-semibold text-gray-900">{fmt(c.amount)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Bar value={c.amount} max={data.expenses.total} color={CATEGORY_COLORS[c.category] ?? "bg-gray-400"} />
                          <span className="text-xs text-gray-400 w-16 text-right">
                            {data.expenses.total > 0 ? Math.round((c.amount / data.expenses.total) * 100) : 0}%
                          </span>
                        </div>
                      </div>
                    ))}
                    <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-sm font-semibold">
                      <span className="text-gray-700">Total Expenses</span>
                      <span className="text-red-600">{fmt(data.expenses.total)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "daily" && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              {data.dailyBreakdown.length === 0 ? (
                <div className="p-12 text-center text-sm text-gray-400">No transactions this month</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Revenue</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Expenses</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Net</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {data.dailyBreakdown.map((row) => {
                      const net = row.revenue - row.expenses;
                      return (
                        <tr key={row.date} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-600">
                            {new Date(row.date).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" })}
                          </td>
                          <td className="px-4 py-3 text-right text-green-700 font-medium">
                            {row.revenue > 0 ? fmt(row.revenue) : "—"}
                          </td>
                          <td className="px-4 py-3 text-right text-red-500 font-medium">
                            {row.expenses > 0 ? fmt(row.expenses) : "—"}
                          </td>
                          <td className={`px-4 py-3 text-right font-semibold ${net >= 0 ? "text-green-700" : "text-red-600"}`}>
                            {net >= 0 ? "+" : "−"}{fmt(net)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                    <tr>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-700">Month Total</td>
                      <td className="px-4 py-3 text-right font-bold text-green-700">{fmt(data.revenue.total)}</td>
                      <td className="px-4 py-3 text-right font-bold text-red-600">{fmt(data.expenses.total)}</td>
                      <td className={`px-4 py-3 text-right font-bold ${data.net >= 0 ? "text-green-700" : "text-red-600"}`}>
                        {data.net >= 0 ? "+" : "−"}{fmt(data.net)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
