"use client";

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { Plus, Pencil, Trash2, X, IndianRupee } from "lucide-react";

const CATEGORIES = [
  { value: "housekeeping", label: "Housekeeping",   color: "bg-blue-100 text-blue-700" },
  { value: "maintenance",  label: "Maintenance",    color: "bg-orange-100 text-orange-700" },
  { value: "food",         label: "Food & Beverage",color: "bg-green-100 text-green-700" },
  { value: "utilities",    label: "Utilities",      color: "bg-yellow-100 text-yellow-700" },
  { value: "staff",        label: "Staff",          color: "bg-purple-100 text-purple-700" },
  { value: "marketing",    label: "Marketing",      color: "bg-pink-100 text-pink-700" },
  { value: "other",        label: "Other",          color: "bg-gray-100 text-gray-600" },
];

const PAYMENT_METHODS = [
  { value: "cash",   label: "Cash" },
  { value: "bank",   label: "Bank Transfer" },
  { value: "upi",    label: "UPI" },
  { value: "cheque", label: "Cheque" },
];

interface Expense {
  id: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  paymentMethod: string;
  vendor?: string;
  reference?: string;
  recordedBy: string;
}

const EMPTY_FORM = {
  date: format(new Date(), "yyyy-MM-dd"),
  category: "other",
  description: "",
  amount: "",
  paymentMethod: "cash",
  vendor: "",
  reference: "",
  recordedBy: "",
};

function categoryMeta(cat: string) {
  return CATEGORIES.find((c) => c.value === cat) ?? CATEGORIES[CATEGORIES.length - 1];
}

export default function ExpensesPanel() {
  const today = new Date();
  const [month, setMonth] = useState(format(today, "yyyy-MM"));
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ month });
    if (categoryFilter !== "all") params.set("category", categoryFilter);
    const res = await fetch(`/api/admin/expenses?${params}`);
    const data = await res.json();
    if (data.success) {
      setExpenses(data.data.expenses);
      setTotal(data.data.total);
    }
    setLoading(false);
  }, [month, categoryFilter]);

  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

  function openAdd() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setFormError("");
    setModalOpen(true);
  }

  function openEdit(e: Expense) {
    setEditing(e);
    setForm({
      date: e.date.slice(0, 10),
      category: e.category,
      description: e.description,
      amount: String(e.amount),
      paymentMethod: e.paymentMethod,
      vendor: e.vendor ?? "",
      reference: e.reference ?? "",
      recordedBy: e.recordedBy,
    });
    setFormError("");
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.description.trim() || !form.amount || !form.recordedBy.trim()) {
      setFormError("Description, amount, and recorded by are required.");
      return;
    }
    setSaving(true);
    setFormError("");
    const body = {
      date: form.date,
      category: form.category,
      description: form.description.trim(),
      amount: parseFloat(form.amount),
      paymentMethod: form.paymentMethod,
      vendor: form.vendor.trim() || undefined,
      reference: form.reference.trim() || undefined,
      recordedBy: form.recordedBy.trim(),
    };
    const url = editing ? `/api/admin/expenses/${editing.id}` : "/api/admin/expenses";
    const method = editing ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.success) {
      setModalOpen(false);
      fetchExpenses();
    } else {
      setFormError("Failed to save. Please try again.");
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    await fetch(`/api/admin/expenses/${id}`, { method: "DELETE" });
    setDeleteId(null);
    fetchExpenses();
  }

  const monthLabel = new Date(month + "-01").toLocaleString("en-IN", { month: "long", year: "numeric" });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-end gap-3 mb-6">
        <button onClick={openAdd} className="flex items-center gap-2 bg-[#4A6741] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#3d5636] transition-colors">
          <Plus size={16} />
          Add Expense
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#4A6741]"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#4A6741]"
        >
          <option value="all">All Categories</option>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      {/* Summary bar */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide">Total Expenses</p>
          <p className="text-2xl font-semibold text-gray-900 mt-0.5">
            ₹{total.toLocaleString("en-IN")}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{monthLabel} · {expenses.length} entries</p>
        </div>
        {/* Category totals */}
        <div className="hidden sm:flex gap-3 flex-wrap justify-end">
          {CATEGORIES.filter((c) => expenses.some((e) => e.category === c.value)).map((c) => {
            const catTotal = expenses.filter((e) => e.category === c.value).reduce((s, e) => s + Number(e.amount), 0);
            return (
              <div key={c.value} className="text-right">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.color}`}>{c.label}</span>
                <p className="text-sm font-medium text-gray-700 mt-0.5">₹{catTotal.toLocaleString("en-IN")}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400 text-sm">Loading…</div>
        ) : expenses.length === 0 ? (
          <div className="p-12 text-center">
            <IndianRupee size={32} className="text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">No expenses recorded for {monthLabel}</p>
            <button onClick={openAdd} className="mt-3 text-[#4A6741] text-sm font-medium hover:underline">Add first expense →</button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Vendor</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Method</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {expenses.map((e) => {
                const meta = categoryMeta(e.category);
                return (
                  <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {new Date(e.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${meta.color}`}>{meta.label}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-800 font-medium">{e.description}</td>
                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{e.vendor || "—"}</td>
                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell capitalize">{e.paymentMethod}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      ₹{Number(e.amount).toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => openEdit(e)} className="p-1.5 text-gray-400 hover:text-[#4A6741] hover:bg-gray-100 rounded transition-colors">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => setDeleteId(e.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t-2 border-gray-200 bg-gray-50">
              <tr>
                <td colSpan={5} className="px-4 py-3 text-sm font-semibold text-gray-600">Total</td>
                <td className="px-4 py-3 text-right font-bold text-gray-900">₹{total.toLocaleString("en-IN")}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Add / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-semibold text-gray-900">{editing ? "Edit Expense" : "Add Expense"}</h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Date *</label>
                  <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#4A6741]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Category *</label>
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#4A6741]">
                    {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Description *</label>
                <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="e.g. Monthly housekeeping supplies"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#4A6741]" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Amount (₹) *</label>
                  <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    placeholder="0.00"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#4A6741]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Payment Method *</label>
                  <select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#4A6741]">
                    {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Vendor / Payee</label>
                  <input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })}
                    placeholder="Supplier name"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#4A6741]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Reference / Receipt #</label>
                  <input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })}
                    placeholder="INV-001"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#4A6741]" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Recorded By *</label>
                <input value={form.recordedBy} onChange={(e) => setForm({ ...form, recordedBy: e.target.value })}
                  placeholder="Your name"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#4A6741]" />
              </div>
              {formError && <p className="text-red-500 text-xs">{formError}</p>}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t">
              <button onClick={() => setModalOpen(false)} className="flex-1 border border-gray-200 rounded-lg py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 bg-[#4A6741] text-white rounded-lg py-2 text-sm font-medium hover:bg-[#3d5636] disabled:opacity-50 transition-colors">
                {saving ? "Saving…" : editing ? "Save Changes" : "Add Expense"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="font-semibold text-gray-900 mb-2">Delete Expense?</h3>
            <p className="text-sm text-gray-500 mb-5">This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 border border-gray-200 rounded-lg py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={() => handleDelete(deleteId)} className="flex-1 bg-red-500 text-white rounded-lg py-2 text-sm font-medium hover:bg-red-600">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
