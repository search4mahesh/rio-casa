"use client";

import { useEffect, useState, useCallback, useId } from "react";
import { useToast, Toast } from "@/components/ui/Toast";

type Promo = {
  id: string; code: string; name?: string | null;
  discountType: string; discountValue: number; maxDiscount?: number | null;
  validFrom: string; validTo: string;
  minNights: number; minAmount: number;
  usageLimit?: number | null; usedCount: number;
  isActive: boolean; createdAt: string;
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function PromosPanel() {
  const [promos, setPromos] = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Promo | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const { toast, showToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/promos");
    const data = await res.json();
    if (data.success) setPromos(data.data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);


  async function toggleActive(promo: Promo) {
    setTogglingId(promo.id);
    const res = await fetch(`/api/admin/promos/${promo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !promo.isActive }),
    });
    const data = await res.json();
    if (data.success) { showToast(promo.isActive ? "Code deactivated" : "Code activated"); load(); }
    else showToast(data.error ?? "Error");
    setTogglingId(null);
  }

  async function deletePromo(id: string) {
    setDeletingId(id);
    const res = await fetch(`/api/admin/promos/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.success) { showToast("Promo code deleted"); load(); }
    else showToast(data.error ?? "Delete failed");
    setDeletingId(null);
  }

  function discountLabel(p: Promo) {
    if (p.discountType === "percentage") {
      const label = `${p.discountValue}% off`;
      return p.maxDiscount ? `${label} (max ₹${Number(p.maxDiscount).toLocaleString("en-IN")})` : label;
    }
    return `₹${Number(p.discountValue).toLocaleString("en-IN")} off`;
  }

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-end gap-3 mb-6">
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 btn-admin">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Promo Code
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading…</div>
      ) : promos.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
          </div>
          <div className="text-gray-500 font-medium">No promo codes yet</div>
          <div className="text-sm text-gray-400 mt-1">Create your first discount code</div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 font-medium text-gray-500">Code</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Discount</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Valid Period</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Conditions</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Usage</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {promos.map((p) => {
                const isExpired = new Date(p.validTo) < new Date();
                const usagePct = p.usageLimit ? (p.usedCount / p.usageLimit) * 100 : 0;
                return (
                  <tr key={p.id} className={`hover:bg-gray-50 ${!p.isActive || isExpired ? "opacity-60" : ""}`}>
                    <td className="px-5 py-3.5">
                      <div className="font-mono font-semibold text-gray-900 text-base">{p.code}</div>
                      {p.name && <div className="text-xs text-gray-400">{p.name}</div>}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded text-xs font-medium">
                        {discountLabel(p)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-gray-600 text-xs">
                      {fmtDate(p.validFrom)} →<div>{fmtDate(p.validTo)}</div>
                      {isExpired && <span className="text-red-400">Expired</span>}
                    </td>
                    <td className="px-5 py-3.5 text-gray-500 text-xs">
                      {p.minNights > 1 && <div>Min {p.minNights} nights</div>}
                      {Number(p.minAmount) > 0 && <div>Min ₹{Number(p.minAmount).toLocaleString("en-IN")}</div>}
                      {p.minNights <= 1 && Number(p.minAmount) === 0 && "—"}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="text-sm font-medium text-gray-700">
                        {p.usedCount}{p.usageLimit ? ` / ${p.usageLimit}` : ""} used
                      </div>
                      {p.usageLimit && (
                        <div className="mt-1 h-1.5 w-24 bg-gray-200 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${usagePct >= 90 ? "bg-red-400" : usagePct >= 60 ? "bg-amber-400" : "bg-green-400"}`}
                            style={{ width: `${Math.min(100, usagePct)}%` }} />
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <button onClick={() => toggleActive(p)} disabled={togglingId === p.id}
                        className={`px-2.5 py-1 text-xs font-medium rounded-full disabled:opacity-50 transition-colors ${
                          p.isActive ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                        }`}>
                        {togglingId === p.id ? "…" : p.isActive ? "Active" : "Inactive"}
                      </button>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => setEditing(p)}
                          className="px-2.5 py-1 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                          Edit
                        </button>
                        <button onClick={() => deletePromo(p.id)} disabled={deletingId === p.id || p.usedCount > 0}
                          title={p.usedCount > 0 ? "Cannot delete a code that has been used" : ""}
                          className="px-2.5 py-1 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                          {deletingId === p.id ? "…" : "Delete"}
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

      <Toast message={toast} />

      {(showAdd || editing) && (
        <PromoModal promo={editing} onClose={() => { setShowAdd(false); setEditing(null); load(); }} />
      )}
    </div>
  );
}

// ─── Promo Modal ──────────────────────────────────────────────────────────────

function PromoModal({ promo, onClose }: { promo: Promo | null; onClose: () => void }) {
  const fieldId = useId();
  const [form, setForm] = useState({
    code: promo?.code ?? "",
    name: promo?.name ?? "",
    discountType: promo?.discountType ?? "percentage",
    discountValue: promo ? String(promo.discountValue) : "",
    maxDiscount: promo?.maxDiscount ? String(promo.maxDiscount) : "",
    validFrom: promo ? promo.validFrom.split("T")[0] : "",
    validTo: promo ? promo.validTo.split("T")[0] : "",
    minNights: promo ? String(promo.minNights) : "1",
    minAmount: promo ? String(promo.minAmount) : "0",
    usageLimit: promo?.usageLimit ? String(promo.usageLimit) : "",
    isActive: promo?.isActive ?? true,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const f = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((p) => ({ ...p, [field]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const payload: Record<string, unknown> = {
      name: form.name || undefined,
      discountType: form.discountType,
      discountValue: parseFloat(form.discountValue),
      maxDiscount: form.maxDiscount ? parseFloat(form.maxDiscount) : undefined,
      validFrom: form.validFrom, validTo: form.validTo,
      minNights: parseInt(form.minNights) || 1,
      minAmount: parseFloat(form.minAmount) || 0,
      usageLimit: form.usageLimit ? parseInt(form.usageLimit) : undefined,
      isActive: form.isActive,
    };
    if (!promo) {
      payload.code = form.code.toUpperCase();
    }
    const url = promo ? `/api/admin/promos/${promo.id}` : "/api/admin/promos";
    const method = promo ? "PATCH" : "POST";
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
            <h2 className="font-semibold text-gray-900">{promo ? "Edit Promo Code" : "Add Promo Code"}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor={`${fieldId}-code`} className="block text-sm font-medium text-gray-700 mb-1">Code *</label>
                <input id={`${fieldId}-code`} required value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
                  disabled={!!promo} placeholder="SUMMER20"
                  className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary font-mono disabled:bg-gray-50"
                  pattern="[A-Z0-9_-]+" title="Uppercase letters, numbers, _ and - only" />
              </div>
              <div>
                <label htmlFor={`${fieldId}-internal-name`} className="block text-sm font-medium text-gray-700 mb-1">Internal Name</label>
                <input id={`${fieldId}-internal-name`} value={form.name} onChange={f("name")} placeholder="e.g. Summer promo 2026"
                  className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor={`${fieldId}-discount-type`} className="block text-sm font-medium text-gray-700 mb-1">Discount Type *</label>
                <select id={`${fieldId}-discount-type`} required value={form.discountType} onChange={f("discountType")}
                  className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white">
                  <option value="percentage">Percentage (%)</option>
                  <option value="flat">Flat Amount (₹)</option>
                </select>
              </div>
              <div>
                <label htmlFor={`${fieldId}-discount-value`} className="block text-sm font-medium text-gray-700 mb-1">
                  {form.discountType === "percentage" ? "Discount (%)" : "Discount (₹)"} *
                </label>
                <input id={`${fieldId}-discount-value`} required type="number" min="0.01" step="0.01" value={form.discountValue} onChange={f("discountValue")}
                  className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            </div>

            {form.discountType === "percentage" && (
              <div>
                <label htmlFor={`${fieldId}-max-discount-cap`} className="block text-sm font-medium text-gray-700 mb-1">Max Discount Cap (₹)</label>
                <input id={`${fieldId}-max-discount-cap`} type="number" min="0" step="0.01" value={form.maxDiscount} onChange={f("maxDiscount")} placeholder="Leave blank for no cap"
                  className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor={`${fieldId}-valid-from`} className="block text-sm font-medium text-gray-700 mb-1">Valid From *</label>
                <input id={`${fieldId}-valid-from`} required type="date" value={form.validFrom} onChange={f("validFrom")}
                  className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label htmlFor={`${fieldId}-valid-to`} className="block text-sm font-medium text-gray-700 mb-1">Valid To *</label>
                <input id={`${fieldId}-valid-to`} required type="date" min={form.validFrom} value={form.validTo} onChange={f("validTo")}
                  className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label htmlFor={`${fieldId}-min-nights`} className="block text-sm font-medium text-gray-700 mb-1">Min Nights</label>
                <input id={`${fieldId}-min-nights`} type="number" min="1" value={form.minNights} onChange={f("minNights")}
                  className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label htmlFor={`${fieldId}-min-amount`} className="block text-sm font-medium text-gray-700 mb-1">Min Amount (₹)</label>
                <input id={`${fieldId}-min-amount`} type="number" min="0" value={form.minAmount} onChange={f("minAmount")}
                  className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label htmlFor={`${fieldId}-usage-limit`} className="block text-sm font-medium text-gray-700 mb-1">Usage Limit</label>
                <input id={`${fieldId}-usage-limit`} type="number" min="1" value={form.usageLimit} onChange={f("usageLimit")} placeholder="Unlimited"
                  className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input type="checkbox" id="promoActive" checked={form.isActive}
                onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))} className="accent-primary" />
              <label htmlFor="promoActive" className="text-sm text-gray-700">Active (bookings can use this code)</label>
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={loading}
                className="flex-1 py-2.5 btn-admin">
                {loading ? "Saving…" : promo ? "Save Changes" : "Add Promo Code"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
