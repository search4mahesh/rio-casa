"use client";

import { useEffect, useState, useCallback } from "react";
import { useToast, Toast } from "@/components/ui/Toast";
import { Field } from "@/components/ui/Field";
import { apiJson } from "@/lib/api-client";
import { ErrorState } from "@/components/ui/ErrorState";

type LinenItem = { id: string; name: string; category: string; ratePerPiece: number };

type BatchItem = {
  id: string;
  linenItemId: string;
  qtySent: number;
  qtyReturned: number;
  qtyDamaged: number;
  qtyPending: number;
  ratePerPiece: number;
  linenItem: { id: string; name: string; category: string };
};

type Batch = {
  id: string;
  batchNumber: string;
  sentDate: string;
  returnedDate: string | null;
  status: string;
  vendorName: string | null;
  notes: string | null;
  sentBy: string;
  receivedBy: string | null;
  totalPieces: number;
  totalCost: number;
  items: BatchItem[];
};

type Outstanding = { linenItemId: string; name: string; qty: number };
type Summary = { openBatches: number; piecesOut: number; totalCost: number };

const STATUS_CFG: Record<string, { label: string; color: string }> = {
  sent:      { label: "At laundry", color: "bg-amber-100 text-amber-700" },
  partial:   { label: "Part returned", color: "bg-orange-100 text-orange-700" },
  returned:  { label: "Returned", color: "bg-green-100 text-green-700" },
  cancelled: { label: "Cancelled", color: "bg-gray-100 text-gray-500" },
};

const CATEGORY_LABEL: Record<string, string> = {
  towel: "Towels",
  bedding: "Bedding",
  other: "Other",
};

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
function rupees(n: number) {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export default function LaundryPanel() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [outstanding, setOutstanding] = useState<Outstanding[]>([]);
  const [summary, setSummary] = useState<Summary>({ openBatches: 0, piecesOut: 0, totalCost: 0 });
  const [items, setItems] = useState<LinenItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState("outstanding");
  const [showDispatch, setShowDispatch] = useState(false);
  const [returning, setReturning] = useState<Batch | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { toast, showToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const [b, i] = await Promise.all([
      apiJson(`/api/admin/laundry?status=${filter}`),
      apiJson("/api/admin/laundry/items"),
    ]);
    if (b.success) {
      setBatches(b.data.batches);
      setOutstanding(b.data.outstanding);
      setSummary(b.data.summary);
    }
    else setLoadError(b.error);
    if (i.success) setItems(i.data);
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function deleteBatch(id: string, batchNumber: string) {
    // The batch is kept and marked cancelled, not removed — the record of what
    // went to the laundryman survives either way.
    if (!confirm(`Cancel ${batchNumber}? It stays on record, marked cancelled.`)) return;
    const data = await apiJson(`/api/admin/laundry/${id}`, { method: "DELETE" });
    if (data.success) { showToast("Batch cancelled"); load(); }
    else showToast(data.error ?? "Could not cancel batch");
  }

  return (
    <div className="p-6 max-w-6xl">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border-2 border-amber-200 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Pieces at laundry</div>
          <div className="text-2xl font-bold text-amber-600 mt-1">{summary.piecesOut}</div>
          <div className="text-xs text-gray-400 mt-0.5">{summary.openBatches} open batch{summary.openBatches !== 1 ? "es" : ""}</div>
        </div>
        <div className="bg-white rounded-xl border-2 border-gray-200 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Item types outstanding</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{outstanding.length}</div>
          <div className="text-xs text-gray-400 mt-0.5">awaiting return</div>
        </div>
        <div className="bg-white rounded-xl border-2 border-primary/30 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Laundry cost (shown)</div>
          <div className="text-2xl font-bold text-primary mt-1">{rupees(summary.totalCost)}</div>
          <div className="text-xs text-gray-400 mt-0.5">across listed batches</div>
        </div>
      </div>

      {/* Outstanding breakdown */}
      {outstanding.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
          <div className="text-sm font-semibold text-amber-900 mb-2">Still with the laundryman</div>
          <div className="flex flex-wrap gap-2">
            {outstanding.map((o) => (
              <span key={o.linenItemId} className="px-2.5 py-1 bg-white border border-amber-200 rounded-lg text-xs">
                <span className="font-semibold text-amber-800">{o.qty}×</span>{" "}
                <span className="text-gray-700">{o.name}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 mb-5">
        <select value={filter} onChange={(e) => setFilter(e.target.value)}
          className="text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white">
          <option value="outstanding">Outstanding</option>
          <option value="all">All batches</option>
          <option value="returned">Returned</option>
        </select>
        <button onClick={() => setShowDispatch(true)} className="flex items-center gap-2 px-4 py-2 btn-admin">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Send Laundry
        </button>
      </div>

      {/* Batch list */}
      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading…</div>
      ) : loadError ? (
        <ErrorState message={loadError} onRetry={load} className="py-16" />
      ) : batches.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">🧺</div>
          <div className="text-gray-500 font-medium">
            {filter === "outstanding" ? "Nothing at the laundry" : "No batches yet"}
          </div>
          <div className="text-sm text-gray-400 mt-1">Use “Send Laundry” to record a dispatch</div>
        </div>
      ) : (
        <div className="space-y-3">
          {batches.map((b) => {
            const missing = b.items.reduce((s, i) => s + i.qtyPending, 0);
            const damaged = b.items.reduce((s, i) => s + i.qtyDamaged, 0);
            const cfg = STATUS_CFG[b.status] ?? STATUS_CFG.sent;
            const isOpen = expanded === b.id;

            return (
              <div key={b.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <button onClick={() => setExpanded(isOpen ? null : b.id)}
                  className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-gray-50 transition-colors">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 font-mono text-sm">{b.batchNumber}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                      {missing > 0 && b.returnedDate && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                          {missing} missing
                        </span>
                      )}
                      {damaged > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                          {damaged} damaged
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Sent {fmtDate(b.sentDate)}
                      {b.returnedDate && ` · Returned ${fmtDate(b.returnedDate)}`}
                      {b.vendorName && ` · ${b.vendorName}`}
                      {` · by ${b.sentBy}`}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-semibold text-gray-900">{b.totalPieces} pcs</div>
                    <div className="text-xs text-gray-500">{rupees(b.totalCost)}</div>
                  </div>
                  <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isOpen && (
                  <div className="border-t border-gray-100 px-5 py-4 bg-gray-50/50">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-500 uppercase tracking-wide">
                          <th className="text-left pb-2">Item</th>
                          <th className="text-right pb-2">Sent</th>
                          <th className="text-right pb-2">Back</th>
                          <th className="text-right pb-2">Damaged</th>
                          <th className="text-right pb-2">Missing</th>
                          <th className="text-right pb-2">Cost</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {b.items.map((i) => (
                          <tr key={i.id}>
                            <td className="py-1.5 text-gray-800">{i.linenItem.name}</td>
                            <td className="py-1.5 text-right text-gray-700">{i.qtySent}</td>
                            <td className="py-1.5 text-right text-gray-700">{i.qtyReturned}</td>
                            <td className={`py-1.5 text-right ${i.qtyDamaged ? "text-purple-600 font-medium" : "text-gray-400"}`}>{i.qtyDamaged || "—"}</td>
                            <td className={`py-1.5 text-right ${i.qtyPending ? "text-red-600 font-medium" : "text-gray-400"}`}>{i.qtyPending || "—"}</td>
                            <td className="py-1.5 text-right text-gray-700">{rupees(i.qtySent * i.ratePerPiece)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {b.notes && <p className="text-xs text-gray-500 mt-3 italic">{b.notes}</p>}
                    <div className="flex items-center gap-2 mt-4">
                      {b.status !== "returned" && b.status !== "cancelled" && (
                        <button onClick={() => setReturning(b)} className="px-3 py-1.5 text-xs btn-admin">
                          Record Return
                        </button>
                      )}
                      {/* Cancelling is only for a batch entered by mistake. Once
                          pieces have come back it is a real event, and the API
                          rejects it — so don't offer the button. */}
                      {b.status === "sent" && (
                        <button onClick={() => deleteBatch(b.id, b.batchNumber)}
                          className="px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
                          Cancel Batch
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Toast message={toast} />

      {showDispatch && (
        <DispatchModal items={items}
          onClose={() => setShowDispatch(false)}
          onSaved={(msg) => { setShowDispatch(false); showToast(msg); load(); }} />
      )}
      {returning && (
        <ReturnModal batch={returning}
          onClose={() => setReturning(null)}
          onSaved={(msg) => { setReturning(null); showToast(msg); load(); }} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Dispatch — pick quantities per item type
// ─────────────────────────────────────────────────────────────

function DispatchModal({
  items, onClose, onSaved,
}: { items: LinenItem[]; onClose: () => void; onSaved: (msg: string) => void }) {
  const [sentDate, setSentDate] = useState(today());
  const [vendorName, setVendorName] = useState("");
  const [notes, setNotes] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const chosen = Object.entries(qty).filter(([, n]) => n > 0);
  const totalPieces = chosen.reduce((s, [, n]) => s + n, 0);
  const totalCost = chosen.reduce((s, [id, n]) => {
    const item = items.find((i) => i.id === id);
    return s + n * (item?.ratePerPiece ?? 0);
  }, 0);

  const byCategory = items.reduce<Record<string, LinenItem[]>>((acc, i) => {
    (acc[i.category] ??= []).push(i);
    return acc;
  }, {});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!chosen.length) { setError("Add at least one item"); return; }
    setSaving(true);
    setError("");

    const data = await apiJson("/api/admin/laundry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sentDate, vendorName: vendorName || undefined, notes: notes || undefined,
        items: chosen.map(([linenItemId, qtySent]) => ({ linenItemId, qtySent })),
      }),
    });
    setSaving(false);
    if (data.success) onSaved(`${totalPieces} pieces sent to laundry`);
    else setError(data.error ?? "Could not save");
  }

  return (
    <Modal title="Send Laundry" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date sent *">
            {(id) => <input id={id} required type="date" value={sentDate} onChange={(e) => setSentDate(e.target.value)} className={inputCls} />}
          </Field>
          <Field label="Laundryman">
            {(id) => <input id={id} type="text" value={vendorName} onChange={(e) => setVendorName(e.target.value)}
              placeholder="e.g. Suresh Laundry" className={inputCls} />}
          </Field>
        </div>

        <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-72 overflow-y-auto">
          {Object.entries(byCategory).map(([cat, catItems]) => (
            <div key={cat}>
              <div className="px-3 py-1.5 bg-gray-50 text-[11px] font-semibold text-gray-500 uppercase tracking-widest">
                {CATEGORY_LABEL[cat] ?? cat}
              </div>
              {catItems.map((i) => (
                <div key={i.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-800 truncate">{i.name}</div>
                    <div className="text-xs text-gray-400">{rupees(i.ratePerPiece)}/pc</div>
                  </div>
                  <input type="number" min="0" inputMode="numeric"
                    value={qty[i.id] ?? ""} placeholder="0"
                    onChange={(e) => setQty({ ...qty, [i.id]: Math.max(0, Number(e.target.value) || 0) })}
                    className="w-20 text-sm text-right px-2 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              ))}
            </div>
          ))}
        </div>

        <Field label="Notes">
          {(id) => <input id={id} type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional" className={inputCls} />}
        </Field>

        <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 rounded-lg text-sm">
          <span className="text-gray-600">{totalPieces} piece{totalPieces !== 1 ? "s" : ""}</span>
          <span className="font-semibold text-gray-900">{rupees(totalCost)}</span>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={saving || !totalPieces} className="flex-1 py-2.5 btn-admin">
            {saving ? "Saving…" : "Send"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// Return — record what actually came back
// ─────────────────────────────────────────────────────────────

function ReturnModal({
  batch, onClose, onSaved,
}: { batch: Batch; onClose: () => void; onSaved: (msg: string) => void }) {
  const [returnedDate, setReturnedDate] = useState(today());
  const [rows, setRows] = useState(() =>
    batch.items.map((i) => ({
      id: i.id,
      name: i.linenItem.name,
      qtySent: i.qtySent,
      // Default to "everything came back" — the common case, so staff only
      // touch the lines that are actually short.
      qtyReturned: i.qtyReturned || i.qtySent,
      qtyDamaged: i.qtyDamaged,
    }))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const missing = rows.reduce((s, r) => s + Math.max(0, r.qtySent - r.qtyReturned - r.qtyDamaged), 0);
  const over = rows.find((r) => r.qtyReturned + r.qtyDamaged > r.qtySent);

  function update(id: string, field: "qtyReturned" | "qtyDamaged", value: number) {
    setRows(rows.map((r) => (r.id === id ? { ...r, [field]: Math.max(0, value) } : r)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (over) { setError(`${over.name}: more came back than went out`); return; }
    setSaving(true);
    setError("");

    const data = await apiJson(`/api/admin/laundry/${batch.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        returnedDate,
        items: rows.map(({ id, qtyReturned, qtyDamaged }) => ({ id, qtyReturned, qtyDamaged })),
      }),
    });
    setSaving(false);
    if (data.success) {
      onSaved(missing > 0 ? `Return recorded — ${missing} piece(s) still missing` : "All linen returned");
    } else setError(data.error ?? "Could not save");
  }

  return (
    <Modal title={`Return — ${batch.batchNumber}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Date returned *">
          {(id) => <input id={id} required type="date" value={returnedDate} onChange={(e) => setReturnedDate(e.target.value)} className={inputCls} />}
        </Field>

        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="grid grid-cols-[1fr_60px_70px_70px] gap-2 px-3 py-2 bg-gray-50 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
            <span>Item</span><span className="text-right">Sent</span>
            <span className="text-right">Back</span><span className="text-right">Damaged</span>
          </div>
          <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
            {rows.map((r) => {
              const short = r.qtySent - r.qtyReturned - r.qtyDamaged;
              return (
                <div key={r.id} className="grid grid-cols-[1fr_60px_70px_70px] gap-2 px-3 py-2 items-center">
                  <div className="min-w-0">
                    <div className="text-sm text-gray-800 truncate">{r.name}</div>
                    {short > 0 && <div className="text-xs text-red-600">{short} missing</div>}
                  </div>
                  <span className="text-sm text-right text-gray-500">{r.qtySent}</span>
                  <input type="number" min="0" max={r.qtySent} value={r.qtyReturned}
                    onChange={(e) => update(r.id, "qtyReturned", Number(e.target.value) || 0)}
                    className="w-full text-sm text-right px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary" />
                  <input type="number" min="0" max={r.qtySent} value={r.qtyDamaged}
                    onChange={(e) => update(r.id, "qtyDamaged", Number(e.target.value) || 0)}
                    className="w-full text-sm text-right px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              );
            })}
          </div>
        </div>

        {missing > 0 && (
          <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {missing} piece{missing !== 1 ? "s" : ""} unaccounted for. The batch stays open so it keeps showing as outstanding.
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="flex-1 py-2.5 btn-admin">
            {saving ? "Saving…" : "Record Return"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────

const inputCls =
  "w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary";

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto pointer-events-auto">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 sticky top-0 bg-white">
            <h3 className="font-semibold text-gray-900">{title}</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="p-5">{children}</div>
        </div>
      </div>
    </>
  );
}
