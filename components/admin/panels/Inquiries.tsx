"use client";

import { useEffect, useState, useCallback } from "react";
import { Mail, Phone, Check, RotateCcw } from "lucide-react";
import { useToast, Toast } from "@/components/ui/Toast";
import { apiJson } from "@/lib/api-client";
import { ErrorState } from "@/components/ui/ErrorState";

// ─────────────────────────────────────────────────────────────
// Inbound contact-form submissions.
//
// `/api/contact` wrote to `contact_inquiries` and nothing ever read it
// (B-61): staff saw an inquiry only if the best-effort Resend notification
// happened to land, while the guest was told "We will contact you shortly."
//
// A worklist rather than a log — the default view is what is still open, and
// marking one off is what takes it out of that view. Reversible, because the
// alternative to an undo is a row that has silently left the only place
// anyone looks.
// ─────────────────────────────────────────────────────────────

type Inquiry = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  message: string;
  handledAt?: string | null;
  handledBy?: string | null;
  createdAt: string;
};

type Status = "open" | "handled" | "all";

const FILTERS: Array<{ value: Status; label: string }> = [
  { value: "open", label: "Open" },
  { value: "handled", label: "Handled" },
  { value: "all", label: "All" },
];

function fmtWhen(d: string) {
  return new Date(d).toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export default function InquiriesPanel() {
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState<Status>("open");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const { toast, showToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    // `apiJson` cannot throw, so `setLoading(false)` below is always reached —
    // a hand-written fetch + res.json() pair left the panel on "Loading…"
    // forever when the network dropped or a route returned an empty body (B-39).
    const data = await apiJson(`/api/admin/inquiries?status=${status}&page=${page}`);
    if (data.success) {
      setInquiries(data.data.inquiries);
      setTotal(data.data.total);
      setOpenCount(data.data.openCount);
      setPageSize(data.data.pageSize);
    } else {
      // Not the empty state: "No inquiries" says the property has none, when
      // in truth we never managed to ask.
      setLoadError(data.error);
    }
    setLoading(false);
  }, [status, page]);

  useEffect(() => { load(); }, [load]);

  async function setHandled(inquiry: Inquiry, handled: boolean) {
    setUpdatingId(inquiry.id);
    const data = await apiJson(`/api/admin/inquiries/${inquiry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handled }),
    });
    if (data.success) {
      showToast(handled ? `Marked handled — ${inquiry.name}` : "Reopened");
      load();
    } else {
      showToast(data.error);
    }
    setUpdatingId(null);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-semibold text-gray-900">Website Inquiries</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {openCount === 0
              ? "Nothing waiting for a reply"
              : `${openCount} waiting for a reply`}
          </p>
        </div>

        {/* A row of buttons is a group, not a labelled control — so a <span id>
            plus role="group", never a <label>. See CLAUDE.md. */}
        <div role="group" aria-label="Filter by status" className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={status === f.value}
              onClick={() => { setStatus(f.value); setPage(1); }}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                status === f.value
                  ? "border-primary bg-primary text-white"
                  : "border-gray-300 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {f.label}
              {f.value === "open" && openCount > 0 ? ` (${openCount})` : ""}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-16 text-center text-gray-400">Loading…</div>
      ) : loadError ? (
        <ErrorState message={loadError} onRetry={load} />
      ) : inquiries.length === 0 ? (
        <div className="py-16 text-center text-gray-400 text-sm">
          {status === "open" ? "No inquiries waiting for a reply." : "No inquiries here."}
        </div>
      ) : (
        <ul className="space-y-3">
          {inquiries.map((q) => {
            const handled = Boolean(q.handledAt);
            return (
              <li
                key={q.id}
                className={`rounded-xl border p-4 ${
                  handled ? "border-gray-200 bg-gray-50" : "border-gray-200 bg-white"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900">{q.name}</span>
                      {handled && (
                        <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">
                          Handled
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-gray-500 flex-wrap">
                      {/* Actionable links, not text: replying is the point of
                          the panel, and the desk works off a phone as often as
                          a desktop. */}
                      <a href={`mailto:${q.email}`} className="inline-flex items-center gap-1 hover:text-primary">
                        <Mail size={13} aria-hidden="true" />
                        {q.email}
                      </a>
                      {q.phone && (
                        <a href={`tel:${q.phone}`} className="inline-flex items-center gap-1 hover:text-primary">
                          <Phone size={13} aria-hidden="true" />
                          {q.phone}
                        </a>
                      )}
                      <span>{fmtWhen(q.createdAt)}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={updatingId === q.id}
                    onClick={() => setHandled(q, !handled)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors disabled:opacity-50 ${
                      handled
                        ? "border-gray-300 text-gray-600 hover:bg-white"
                        : "border-primary text-primary hover:bg-primary hover:text-white"
                    }`}
                  >
                    {handled ? <RotateCcw size={14} aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}
                    {updatingId === q.id ? "…" : handled ? "Reopen" : "Mark handled"}
                  </button>
                </div>

                {/* Rendered as text, never as HTML — this is unescaped guest
                    input straight off a public form. */}
                <p className="mt-3 text-sm text-gray-700 whitespace-pre-wrap break-words">{q.message}</p>

                {handled && q.handledBy && (
                  <p className="mt-2 text-xs text-gray-400">
                    Handled by {q.handledBy} · {q.handledAt ? fmtWhen(q.handledAt) : ""}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!loading && !loadError && totalPages > 1 && (
        <div className="flex items-center justify-between mt-5">
          <span className="text-xs text-gray-500">Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      <Toast message={toast} />
    </div>
  );
}
