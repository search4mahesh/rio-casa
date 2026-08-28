"use client";

import { useEffect, useState, useCallback, useId } from "react";
import { apiJson } from "@/lib/api-client";
import { ErrorState } from "@/components/ui/ErrorState";
import {
  AUDIT_ACTION,
  AUDIT_CATEGORY_LABEL,
  ROLE_LABEL,
  SYSTEM_ACTOR,
  type AuditCategory,
} from "@/lib/labels";

type Actor = { id: string; name: string | null; role: string | null };

type Entry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  oldValue: unknown;
  newValue: unknown;
  ipAddress: string | null;
  createdAt: string;
  actor: Actor;
};

type StaffMember = { id: string; name: string; role: string };

type Filters = {
  actor: "staff" | "system" | "all";
  staffId: string;
  category: string;
  from: string;
  to: string;
};

const EMPTY_FILTERS: Filters = { actor: "staff", staffId: "", category: "notable", from: "", to: "" };

const PAGE_SIZE = 50;

/** Display text for an action, falling back to the raw value. */
function actionLabel(action: string): string {
  return AUDIT_ACTION[action]?.label ?? action;
}

/**
 * Who did it. `system` covers guest-driven and automated writes — a website
 * booking, a payment verification, the hold sweeper — and reads as "Website /
 * automatic" rather than a name, because there is no person behind it.
 *
 * A staff id with no matching row means the account was deleted after the
 * action. The row still shows, labelled as such: an audit trail that hides
 * what a since-departed employee did is worse than useless.
 */
function actorLabel(actor: Actor): { text: string; muted: boolean } {
  if (actor.id === SYSTEM_ACTOR) return { text: "Website / automatic", muted: true };
  if (!actor.name) return { text: "Deleted account", muted: true };
  return { text: actor.name, muted: false };
}

/** The interesting half of an audit row, flattened to `key: value` chips. */
function detailPairs(entry: Entry): [string, string][] {
  const source = (entry.newValue ?? entry.oldValue) as Record<string, unknown> | null;
  if (!source || typeof source !== "object") return [];
  return Object.entries(source)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .slice(0, 6)
    .map(([k, v]) => [k, typeof v === "object" ? JSON.stringify(v) : String(v)]);
}

export default function AuditTrailPanel() {
  const fieldId = useId();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (filters.staffId) qs.set("staffId", filters.staffId);
    else qs.set("actor", filters.actor);
    if (filters.category) qs.set("category", filters.category);
    if (filters.from) qs.set("from", filters.from);
    if (filters.to) qs.set("to", filters.to);

    const data = await apiJson<{ entries: Entry[]; total: number }>(`/api/admin/audit?${qs}`);
    if (data.success) {
      setEntries(data.data.entries);
      setTotal(data.data.total);
    } else {
      // A failed load must not fall through to the empty state — "No activity"
      // would say nobody did anything, when in truth we never managed to ask.
      setLoadError(data.error);
    }
    setLoading(false);
  }, [page, filters]);

  useEffect(() => { load(); }, [load]);

  // The staff filter is a separate, unpaginated read — the log only names the
  // people who appear on the current page, which would make the dropdown's
  // contents change as you page through it.
  useEffect(() => {
    (async () => {
      const data = await apiJson<StaffMember[]>("/api/admin/staff");
      if (data.success) setStaff(data.data);
    })();
  }, []);

  function setFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setPage(1);
    setFilters((f) => ({ ...f, [key]: value }));
  }

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const categories = Object.keys(AUDIT_CATEGORY_LABEL) as AuditCategory[];

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl mb-6">
        <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-sm text-blue-700">
          Every action that changes a booking, a room&rsquo;s availability, a guest record or money
          is recorded here, with who did it and when. The log is read-only — nothing in the admin
          panel can edit or remove an entry.
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <label htmlFor={`${fieldId}-who`} className="block text-xs font-medium text-gray-600 mb-1">Who</label>
          <select
            id={`${fieldId}-who`}
            value={filters.staffId || filters.actor}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "staff" || v === "system" || v === "all") {
                setPage(1);
                setFilters((f) => ({ ...f, actor: v, staffId: "" }));
              } else {
                setFilter("staffId", v);
              }
            }}
            className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="staff">Staff actions</option>
            <option value="system">Website &amp; automatic</option>
            <option value="all">Everything</option>
            {staff.length > 0 && (
              <optgroup label="One person">
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {ROLE_LABEL[s.role] ?? s.role}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        <div>
          <label htmlFor={`${fieldId}-what`} className="block text-xs font-medium text-gray-600 mb-1">What</label>
          <select
            id={`${fieldId}-what`}
            value={filters.category}
            onChange={(e) => setFilter("category", e.target.value)}
            className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="notable">Worth a look</option>
            <option value="">Everything</option>
            {categories.map((c) => (
              <option key={c} value={c}>{AUDIT_CATEGORY_LABEL[c]}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={`${fieldId}-from`} className="block text-xs font-medium text-gray-600 mb-1">From</label>
          <input
            id={`${fieldId}-from`}
            type="date"
            value={filters.from}
            onChange={(e) => setFilter("from", e.target.value)}
            className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div>
          <label htmlFor={`${fieldId}-to`} className="block text-xs font-medium text-gray-600 mb-1">To</label>
          <input
            id={`${fieldId}-to`}
            type="date"
            value={filters.to}
            min={filters.from || undefined}
            onChange={(e) => setFilter("to", e.target.value)}
            className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="flex items-end">
          <button
            onClick={() => { setPage(1); setFilters(EMPTY_FILTERS); }}
            className="w-full px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Reset
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading…</div>
      ) : loadError ? (
        <ErrorState message={loadError} onRetry={load} className="py-16" />
      ) : entries.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-gray-500 font-medium">No activity matches these filters</div>
          <div className="text-sm text-gray-400 mt-1">Try widening the date range, or “Everything”.</div>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr className="text-left text-xs font-medium text-gray-500">
                    <th className="px-5 py-3">When</th>
                    <th className="px-5 py-3">Who</th>
                    <th className="px-5 py-3">Action</th>
                    <th className="px-5 py-3">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {entries.map((e) => {
                    const who = actorLabel(e.actor);
                    const meta = AUDIT_ACTION[e.action];
                    const when = new Date(e.createdAt);
                    return (
                      <tr key={e.id} className="hover:bg-gray-50 align-top">
                        <td className="px-5 py-3 whitespace-nowrap text-gray-500">
                          <div>{when.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</div>
                          <div className="text-xs text-gray-400">
                            {when.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap">
                          <span className={who.muted ? "text-gray-400 italic" : "font-medium text-gray-900"}>
                            {who.text}
                          </span>
                          {e.actor.role && (
                            <div className="text-xs text-gray-400">{ROLE_LABEL[e.actor.role] ?? e.actor.role}</div>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <span className={meta?.notable ? "font-medium text-amber-700" : "text-gray-800"}>
                            {actionLabel(e.action)}
                          </span>
                          <div className="text-xs text-gray-400">
                            {e.entityType}
                            {e.entityId && e.entityId !== "all" ? ` · ${e.entityId.slice(0, 12)}` : ""}
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            {detailPairs(e).map(([k, v]) => (
                              <span key={k} className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600">
                                <span className="text-gray-400">{k}</span>
                                <span className="font-medium">{v.length > 40 ? `${v.slice(0, 40)}…` : v}</span>
                              </span>
                            ))}
                            {e.ipAddress && (
                              <span className="inline-flex px-2 py-0.5 bg-gray-50 border border-gray-100 rounded text-xs text-gray-400">
                                {e.ipAddress}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between mt-4 text-sm">
            <span className="text-gray-500">
              {total.toLocaleString("en-IN")} entr{total === 1 ? "y" : "ies"} · page {page} of {lastPage}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
                disabled={page >= lastPage}
                className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
