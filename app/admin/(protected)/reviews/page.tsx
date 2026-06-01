"use client";

import { useEffect, useState, useCallback } from "react";

type Review = {
  id: string; platform: string; guestName: string; rating: number;
  reviewText: string; reviewUrl?: string | null;
  datePosted: string; responded: boolean; respondedAt?: string | null;
  notes?: string | null;
};

type KPI = { total: number; avgRating: number; respondedPct: number };

const PLATFORM_LABEL: Record<string, string> = {
  google: "Google", booking_com: "Booking.com", tripadvisor: "TripAdvisor", mmt: "MakeMyTrip", other: "Other",
};

const PLATFORM_COLOR: Record<string, string> = {
  google: "bg-blue-100 text-blue-700",
  booking_com: "bg-indigo-100 text-indigo-700",
  tripadvisor: "bg-green-100 text-green-700",
  mmt: "bg-orange-100 text-orange-700",
  other: "bg-gray-100 text-gray-600",
};

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= rating ? "text-amber-400" : "text-gray-200"}>★</span>
      ))}
    </span>
  );
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [kpi, setKpi] = useState<KPI>({ total: 0, avgRating: 0, respondedPct: 0 });
  const [loading, setLoading] = useState(true);
  const [platformFilter, setPlatformFilter] = useState("all");
  const [respondedFilter, setRespondedFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (platformFilter !== "all") params.set("platform", platformFilter);
    if (respondedFilter !== "all") params.set("responded", respondedFilter);
    const res = await fetch(`/api/admin/reviews?${params}`);
    const data = await res.json();
    if (data.success) { setReviews(data.reviews); setKpi(data.kpi); }
    setLoading(false);
  }, [platformFilter, respondedFilter]);

  useEffect(() => { load(); }, [load]);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(""), 3500); }

  async function toggleResponded(id: string, current: boolean) {
    const res = await fetch(`/api/admin/reviews/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ responded: !current }),
    });
    const data = await res.json();
    if (data.success) load();
    else showToast(data.error ?? "Update failed");
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this review log?")) return;
    const res = await fetch(`/api/admin/reviews/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.success) { showToast("Deleted"); load(); }
    else showToast(data.error ?? "Delete failed");
  }

  return (
    <div className="p-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Reviews Tracker</h1>
          <p className="text-sm text-gray-500 mt-0.5">Log guest reviews from Google, Booking.com, TripAdvisor and others</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[#4A6741] hover:bg-[#3d5636] text-white text-sm font-medium rounded-lg">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Log Review
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border-2 border-gray-200 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Total Reviews</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{kpi.total}</div>
        </div>
        <div className="bg-white rounded-xl border-2 border-amber-200 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Average Rating</div>
          <div className="text-2xl font-bold text-amber-600 mt-1 flex items-center gap-2">
            {kpi.avgRating.toFixed(1)}
            <span className="text-xl"><Stars rating={Math.round(kpi.avgRating)} /></span>
          </div>
        </div>
        <div className="bg-white rounded-xl border-2 border-[#4A6741]/30 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Responded</div>
          <div className="text-2xl font-bold text-[#4A6741] mt-1">{kpi.respondedPct.toFixed(0)}%</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5">
        <select value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value)}
          className="text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4A6741] bg-white">
          <option value="all">All Platforms</option>
          {Object.entries(PLATFORM_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={respondedFilter} onChange={(e) => setRespondedFilter(e.target.value)}
          className="text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4A6741] bg-white">
          <option value="all">All Status</option>
          <option value="false">Pending Response</option>
          <option value="true">Responded</option>
        </select>
      </div>

      {/* Reviews list */}
      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading…</div>
      ) : reviews.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">⭐</div>
          <div className="text-gray-500 font-medium">No reviews logged yet</div>
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => (
            <div key={r.id} className={`bg-white rounded-xl border ${r.responded ? "border-gray-200" : "border-amber-200"} p-4`}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PLATFORM_COLOR[r.platform] ?? "bg-gray-100"}`}>
                    {PLATFORM_LABEL[r.platform] ?? r.platform}
                  </span>
                  <span className="font-medium text-gray-900">{r.guestName}</span>
                  <Stars rating={r.rating} />
                  <span className="text-xs text-gray-400">{fmtDate(r.datePosted)}</span>
                </div>
                <div className="flex items-center gap-2">
                  {!r.responded ? (
                    <button onClick={() => toggleResponded(r.id, false)}
                      className="px-2.5 py-1 text-xs bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors">
                      Mark Responded
                    </button>
                  ) : (
                    <button onClick={() => toggleResponded(r.id, true)}
                      className="px-2.5 py-1 text-xs border border-green-300 text-green-700 bg-green-50 rounded-lg hover:bg-green-100 transition-colors">
                      ✓ Responded
                    </button>
                  )}
                  {r.reviewUrl && (
                    <a href={r.reviewUrl} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-[#4A6741] hover:underline">Open ↗</a>
                  )}
                  <button onClick={() => handleDelete(r.id)} className="text-xs text-red-500 hover:underline">Delete</button>
                </div>
              </div>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{r.reviewText}</p>
              {r.notes && <p className="text-xs text-gray-500 mt-2 italic bg-yellow-50 p-2 rounded">{r.notes}</p>}
            </div>
          ))}
        </div>
      )}

      {toast && <div className="fixed bottom-6 right-6 bg-gray-900 text-white text-sm px-4 py-3 rounded-lg shadow-lg z-50">{toast}</div>}

      {showAdd && <AddReviewModal onClose={() => { setShowAdd(false); load(); }} />}
    </div>
  );
}

// ─── Add Review Modal ─────────────────────────────────────────────────────────

function AddReviewModal({ onClose }: { onClose: () => void }) {
  const today = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState({
    platform: "google",
    guestName: "",
    rating: 5,
    reviewText: "",
    reviewUrl: "",
    datePosted: today,
    notes: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    const payload = {
      ...form,
      reviewUrl: form.reviewUrl || null,
      notes: form.notes || null,
    };
    const res = await fetch("/api/admin/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.success) onClose();
    else setError(data.error ?? "Failed");
    setLoading(false);
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white">
            <h2 className="font-semibold text-gray-900">Log Review</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Platform *</label>
              <select value={form.platform} onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value }))}
                className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg bg-white">
                {Object.entries(PLATFORM_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Guest Name *</label>
              <input required value={form.guestName} onChange={(e) => setForm((f) => ({ ...f, guestName: e.target.value }))}
                maxLength={100}
                className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rating *</label>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button type="button" key={n} onClick={() => setForm((f) => ({ ...f, rating: n }))}
                    className={`text-3xl ${n <= form.rating ? "text-amber-400" : "text-gray-300"} hover:scale-110 transition-transform`}>
                    ★
                  </button>
                ))}
                <span className="ml-2 self-center text-sm text-gray-500">{form.rating}/5</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Review Text *</label>
              <textarea required rows={4} value={form.reviewText} onChange={(e) => setForm((f) => ({ ...f, reviewText: e.target.value }))}
                maxLength={5000}
                className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg resize-none" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date Posted *</label>
                <input type="date" required value={form.datePosted} max={today}
                  onChange={(e) => setForm((f) => ({ ...f, datePosted: e.target.value }))}
                  className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Review URL</label>
                <input type="url" value={form.reviewUrl} onChange={(e) => setForm((f) => ({ ...f, reviewUrl: e.target.value }))}
                  placeholder="https://..."
                  className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Internal Notes</label>
              <textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                maxLength={2000}
                className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg resize-none" />
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose}
                className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={loading}
                className="flex-1 py-2.5 bg-[#4A6741] hover:bg-[#3d5636] disabled:opacity-60 text-white text-sm font-medium rounded-lg">
                {loading ? "Saving…" : "Log Review"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
