"use client";

import { useEffect, useState, useCallback } from "react";
import { Star, Check, X } from "lucide-react";
import { useToast, Toast } from "@/components/ui/Toast";
import { apiJson } from "@/lib/api-client";
import { ErrorState } from "@/components/ui/ErrorState";

// ─────────────────────────────────────────────────────────────
// Guest testimonials shown on the home page.
//
// `Testimonial.isApproved` defaults to false, which implied an approval
// workflow — but there was no panel to approve through, and no page that would
// have read an approved one: the home page carried three quotes hardcoded in
// its own component while 24 rows sat here unread (B-53). This is the missing
// approval half.
//
// Not the same thing as Setup → Reviews, which tracks `ReviewLog` — OTA
// reviews left on Google, Booking.com and the rest, and responded to there.
// These are quotes the property publishes on its own site.
// ─────────────────────────────────────────────────────────────

type Testimonial = {
  id: string;
  guestName: string;
  location: string | null;
  review: string;
  rating: number;
  isApproved: boolean;
  stayDate: string | null;
  createdAt: string;
};

type Status = "all" | "pending" | "approved";

const FILTERS: Array<{ value: Status; label: string }> = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "On the site" },
];

export default function TestimonialsPanel() {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [status, setStatus] = useState<Status>("all");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const { toast, showToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const data = await apiJson(`/api/admin/testimonials?status=${status}`);
    if (data.success) {
      setTestimonials(data.data.testimonials);
      setPendingCount(data.data.pendingCount);
    } else {
      setLoadError(data.error);
    }
    setLoading(false);
  }, [status]);

  useEffect(() => { load(); }, [load]);

  async function setApproved(t: Testimonial, isApproved: boolean) {
    setUpdatingId(t.id);
    const data = await apiJson(`/api/admin/testimonials/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isApproved }),
    });
    if (data.success) {
      showToast(isApproved ? `${t.guestName} is now on the site` : `${t.guestName} taken down`);
      load();
    } else {
      showToast(data.error);
    }
    setUpdatingId(null);
  }

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-semibold text-gray-900">Testimonials</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Approved testimonials appear on the home page.
            {pendingCount > 0 ? ` ${pendingCount} waiting.` : ""}
          </p>
        </div>

        <div role="group" aria-label="Filter by status" className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={status === f.value}
              onClick={() => setStatus(f.value)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                status === f.value
                  ? "border-primary bg-primary text-white"
                  : "border-gray-300 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {f.label}
              {f.value === "pending" && pendingCount > 0 ? ` (${pendingCount})` : ""}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-16 text-center text-gray-400">Loading…</div>
      ) : loadError ? (
        <ErrorState message={loadError} onRetry={load} />
      ) : testimonials.length === 0 ? (
        <div className="py-16 text-center text-gray-400 text-sm">Nothing here.</div>
      ) : (
        <ul className="space-y-3">
          {testimonials.map((t) => (
            <li
              key={t.id}
              className={`rounded-xl border p-4 ${
                t.isApproved ? "border-green-200 bg-green-50/40" : "border-gray-200 bg-white"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-900">{t.guestName}</span>
                    {t.location && <span className="text-xs text-gray-500">{t.location}</span>}
                    <span className="inline-flex gap-0.5" aria-label={`${t.rating} out of 5`}>
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Star
                          key={i}
                          size={13}
                          aria-hidden="true"
                          className={i <= t.rating ? "text-amber-400" : "text-gray-200"}
                          fill={i <= t.rating ? "currentColor" : "none"}
                        />
                      ))}
                    </span>
                    {t.isApproved && (
                      <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">
                        On the site
                      </span>
                    )}
                  </div>
                  {t.stayDate && (
                    <p className="text-xs text-gray-400 mt-1">
                      Stayed{" "}
                      {new Date(t.stayDate).toLocaleDateString("en-IN", {
                        month: "long", year: "numeric", timeZone: "UTC",
                      })}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  disabled={updatingId === t.id}
                  onClick={() => setApproved(t, !t.isApproved)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors disabled:opacity-50 ${
                    t.isApproved
                      ? "border-gray-300 text-gray-600 hover:bg-white"
                      : "border-primary text-primary hover:bg-primary hover:text-white"
                  }`}
                >
                  {t.isApproved ? <X size={14} aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}
                  {updatingId === t.id ? "…" : t.isApproved ? "Take down" : "Publish"}
                </button>
              </div>

              {/* Rendered as text. These are guest words, and the home page
                  renders them the same way. */}
              <p className="mt-3 text-sm text-gray-700 whitespace-pre-wrap break-words">{t.review}</p>
            </li>
          ))}
        </ul>
      )}

      <Toast message={toast} />
    </div>
  );
}
