"use client";

import { useEffect, useState, useCallback } from "react";

type RatePlan = {
  id: string; name: string; roomType: string;
  baseRate: number; extraBedRate: number;
  validFrom: string; validTo: string;
  weekendMarkup: number; minNights: number; priority: number;
  isActive: boolean; createdAt: string;
};

const ROOM_TYPE_LABEL: Record<string, string> = {
  deluxe: "Deluxe", premium: "Premium", family: "Family", all: "All Rooms",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function RatePlansPanel() {
  const [plans, setPlans] = useState<RatePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<RatePlan | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/rate-plans");
    const data = await res.json();
    if (data.success) setPlans(data.plans);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(""), 3500); }

  async function toggleActive(plan: RatePlan) {
    setTogglingId(plan.id);
    const res = await fetch(`/api/admin/rate-plans/${plan.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !plan.isActive }),
    });
    const data = await res.json();
    if (data.success) { showToast(plan.isActive ? "Plan deactivated" : "Plan activated"); load(); }
    else showToast(data.error ?? "Error");
    setTogglingId(null);
  }

  async function deletePlan(id: string) {
    setDeletingId(id);
    const res = await fetch(`/api/admin/rate-plans/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.success) { showToast("Rate plan deleted"); load(); }
    else showToast(data.error ?? "Delete failed");
    setDeletingId(null);
  }

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-end gap-3 mb-6">
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[#4A6741] hover:bg-[#3d5636] text-white text-sm font-medium rounded-lg transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Rate Plan
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading…</div>
      ) : plans.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="text-gray-500 font-medium">No rate plans yet</div>
          <div className="text-sm text-gray-400 mt-1">Create your first seasonal pricing plan</div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 font-medium text-gray-500">Name</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Room Type</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Base Rate</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Valid Period</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Weekend +%</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Min Nights</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {plans.map((plan) => {
                const isExpired = new Date(plan.validTo) < new Date();
                return (
                  <tr key={plan.id} className={`hover:bg-gray-50 ${!plan.isActive || isExpired ? "opacity-60" : ""}`}>
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-gray-900">{plan.name}</div>
                      {plan.priority > 0 && <div className="text-xs text-gray-400">Priority {plan.priority}</div>}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">
                        {ROOM_TYPE_LABEL[plan.roomType] ?? plan.roomType}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-medium text-gray-800">
                      ₹{Number(plan.baseRate).toLocaleString("en-IN")}
                      {Number(plan.extraBedRate) > 0 && (
                        <div className="text-xs text-gray-400">+₹{Number(plan.extraBedRate).toLocaleString("en-IN")} extra bed</div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-gray-600">
                      {fmtDate(plan.validFrom)} →
                      <div>{fmtDate(plan.validTo)}</div>
                      {isExpired && <span className="text-xs text-red-400">Expired</span>}
                    </td>
                    <td className="px-5 py-3.5 text-gray-600">
                      {Number(plan.weekendMarkup) > 0 ? `+${plan.weekendMarkup}%` : "—"}
                    </td>
                    <td className="px-5 py-3.5 text-gray-600">{plan.minNights}N min</td>
                    <td className="px-5 py-3.5">
                      <button onClick={() => toggleActive(plan)} disabled={togglingId === plan.id}
                        className={`px-2.5 py-1 text-xs font-medium rounded-full transition-colors disabled:opacity-50 ${
                          plan.isActive ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                        }`}>
                        {togglingId === plan.id ? "…" : plan.isActive ? "Active" : "Inactive"}
                      </button>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => setEditing(plan)}
                          className="px-2.5 py-1 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                          Edit
                        </button>
                        <button onClick={() => deletePlan(plan.id)} disabled={deletingId === plan.id}
                          className="px-2.5 py-1 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors">
                          {deletingId === plan.id ? "…" : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 bg-gray-900 text-white text-sm px-4 py-3 rounded-lg shadow-lg z-50">{toast}</div>
      )}

      {(showAdd || editing) && (
        <RatePlanModal
          plan={editing}
          onClose={() => { setShowAdd(false); setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

// ─── Rate Plan Modal ──────────────────────────────────────────────────────────

type FormState = {
  name: string; roomType: string; baseRate: string; extraBedRate: string;
  validFrom: string; validTo: string; weekendMarkup: string; minNights: string;
  priority: string; isActive: boolean;
};

function RatePlanModal({ plan, onClose }: { plan: RatePlan | null; onClose: () => void }) {
  const [form, setForm] = useState<FormState>({
    name: plan?.name ?? "",
    roomType: plan?.roomType ?? "all",
    baseRate: plan ? String(plan.baseRate) : "",
    extraBedRate: plan ? String(plan.extraBedRate) : "0",
    validFrom: plan ? plan.validFrom.split("T")[0] : "",
    validTo: plan ? plan.validTo.split("T")[0] : "",
    weekendMarkup: plan ? String(plan.weekendMarkup) : "0",
    minNights: plan ? String(plan.minNights) : "1",
    priority: plan ? String(plan.priority) : "0",
    isActive: plan?.isActive ?? true,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const f = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const payload = {
      name: form.name, roomType: form.roomType,
      baseRate: parseFloat(form.baseRate), extraBedRate: parseFloat(form.extraBedRate) || 0,
      validFrom: form.validFrom, validTo: form.validTo,
      weekendMarkup: parseFloat(form.weekendMarkup) || 0,
      minNights: parseInt(form.minNights) || 1,
      priority: parseInt(form.priority) || 0,
      isActive: form.isActive,
    };
    const url = plan ? `/api/admin/rate-plans/${plan.id}` : "/api/admin/rate-plans";
    const method = plan ? "PATCH" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (data.success) onClose();
    else setError(data.error ?? "Failed");
    setLoading(false);
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white">
            <h2 className="font-semibold text-gray-900">{plan ? "Edit Rate Plan" : "Add Rate Plan"}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Plan Name *</label>
              <input required value={form.name} onChange={f("name")} placeholder='e.g. "Peak Season 2026"'
                className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4A6741]" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Room Type *</label>
                <select required value={form.roomType} onChange={f("roomType")}
                  className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4A6741] bg-white">
                  <option value="all">All Rooms</option>
                  <option value="deluxe">Deluxe</option>
                  <option value="premium">Premium</option>
                  <option value="family">Family</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Base Rate (₹/night) *</label>
                <input required type="number" min="0" step="0.01" value={form.baseRate} onChange={f("baseRate")}
                  className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4A6741]" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Valid From *</label>
                <input required type="date" value={form.validFrom} onChange={f("validFrom")}
                  className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4A6741]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Valid To *</label>
                <input required type="date" min={form.validFrom} value={form.validTo} onChange={f("validTo")}
                  className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4A6741]" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Weekend Markup (%)</label>
                <input type="number" min="0" max="100" step="0.1" value={form.weekendMarkup} onChange={f("weekendMarkup")}
                  className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4A6741]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Min Nights</label>
                <input type="number" min="1" value={form.minNights} onChange={f("minNights")}
                  className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4A6741]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                <input type="number" min="0" value={form.priority} onChange={f("priority")}
                  className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4A6741]" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Extra Bed Rate (₹/night)</label>
              <input type="number" min="0" step="0.01" value={form.extraBedRate} onChange={f("extraBedRate")}
                className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4A6741]" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="isActive" checked={form.isActive}
                onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))} className="accent-[#4A6741]" />
              <label htmlFor="isActive" className="text-sm text-gray-700">Active (applies to new bookings)</label>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={loading}
                className="flex-1 py-2.5 bg-[#4A6741] hover:bg-[#3d5636] disabled:opacity-60 text-white text-sm font-medium rounded-lg">
                {loading ? "Saving…" : plan ? "Save Changes" : "Add Rate Plan"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
