"use client";

import { useEffect, useState, useCallback } from "react";
import { useToast, Toast } from "@/components/ui/Toast";
import { Field } from "@/components/ui/Field";
import { apiJson } from "@/lib/api-client";
import { ErrorState } from "@/components/ui/ErrorState";

// ─────────────────────────────────────────────────────────────
// Stay packages advertised on /packages.
//
// The page used to carry them as a literal, so **editing a price was a code
// change and a deploy** — and the array and the `packages` table drifted into
// advertising different packages at different prices (B-53).
//
// Price and the validity window are what actually change between seasons, so
// those are what this edits. Copy and inclusions are still seeded, because
// rewriting a package's pitch is a different job from repricing it and wants a
// proper editor rather than a text box in a table row.
// ─────────────────────────────────────────────────────────────

type Package = {
  id: string;
  nameEn: string;
  descEn: string;
  price: number;
  inclusions: string[];
  isActive: boolean;
  validFrom: string | null;
  validTo: string | null;
};

/** `2026-07-01T00:00:00.000Z` → `2026-07-01`, for a date input. */
function toDayInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

export default function PackagesPanel() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { price: string; from: string; to: string }>>({});
  const { toast, showToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const data = await apiJson("/api/admin/packages");
    if (data.success) {
      const rows: Package[] = data.data;
      setPackages(rows);
      setDrafts(
        Object.fromEntries(
          rows.map((p) => [p.id, { price: String(p.price), from: toDayInput(p.validFrom), to: toDayInput(p.validTo) }])
        )
      );
    } else {
      setLoadError(data.error);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save(pkg: Package) {
    const draft = drafts[pkg.id];
    const price = Number(draft.price);
    if (!Number.isFinite(price) || price <= 0) {
      showToast("Enter a price above zero");
      return;
    }

    setSavingId(pkg.id);
    const data = await apiJson(`/api/admin/packages/${pkg.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        price,
        // The date inputs already produce `YYYY-MM-DD`, which is exactly what
        // the route wants — no Date is constructed here at all. Building one
        // from local parts to serialise it is how a day becomes the previous
        // day in IST (B-13/B-32/B-34).
        //
        // A cleared field means "no window" — year-round — rather than "leave
        // it as it was", so null is sent explicitly.
        validFrom: draft.from || null,
        validTo: draft.to || null,
      }),
    });
    if (data.success) { showToast(`${pkg.nameEn} saved`); load(); }
    else showToast(data.error);
    setSavingId(null);
  }

  async function toggleActive(pkg: Package) {
    setSavingId(pkg.id);
    const data = await apiJson(`/api/admin/packages/${pkg.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !pkg.isActive }),
    });
    if (data.success) { showToast(`${pkg.nameEn} ${pkg.isActive ? "retired" : "back on the site"}`); load(); }
    else showToast(data.error);
    setSavingId(null);
  }

  function setDraft(id: string, patch: Partial<{ price: string; from: string; to: string }>) {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  }

  const input = "w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <div className="p-6">
      <div className="mb-4">
        <h2 className="font-semibold text-gray-900">Packages</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Shown on the public Packages page. A package outside its date window is hidden
          automatically — leave both dates blank for year-round.
        </p>
      </div>

      {loading ? (
        <div className="py-16 text-center text-gray-400">Loading…</div>
      ) : loadError ? (
        <ErrorState message={loadError} onRetry={load} />
      ) : packages.length === 0 ? (
        <div className="py-16 text-center text-gray-400 text-sm">
          No packages yet — seed them with <code>npx tsx prisma/seed-content.ts</code>.
        </div>
      ) : (
        <ul className="space-y-4">
          {packages.map((pkg) => {
            const draft = drafts[pkg.id];
            const dirty =
              draft &&
              (draft.price !== String(pkg.price) ||
                draft.from !== toDayInput(pkg.validFrom) ||
                draft.to !== toDayInput(pkg.validTo));

            return (
              <li
                key={pkg.id}
                className={`rounded-xl border p-4 ${pkg.isActive ? "border-gray-200 bg-white" : "border-gray-200 bg-gray-50 opacity-75"}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900">{pkg.nameEn}</span>
                      {!pkg.isActive && (
                        <span className="px-2 py-0.5 rounded-full bg-gray-200 text-gray-600 text-xs font-medium">
                          Retired
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1 max-w-xl">{pkg.descEn}</p>
                    <p className="text-xs text-gray-400 mt-1">{pkg.inclusions.length} inclusions</p>
                  </div>

                  <button
                    type="button"
                    disabled={savingId === pkg.id}
                    onClick={() => toggleActive(pkg)}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {pkg.isActive ? "Retire" : "Put back"}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                  <Field label="Price (₹)">
                    {(id) => (
                      <input
                        id={id}
                        type="number"
                        min={1}
                        value={draft?.price ?? ""}
                        onChange={(e) => setDraft(pkg.id, { price: e.target.value })}
                        className={input}
                      />
                    )}
                  </Field>
                  <Field label="On sale from">
                    {(id) => (
                      <input
                        id={id}
                        type="date"
                        value={draft?.from ?? ""}
                        onChange={(e) => setDraft(pkg.id, { from: e.target.value })}
                        className={input}
                      />
                    )}
                  </Field>
                  <Field label="Until">
                    {(id) => (
                      <input
                        id={id}
                        type="date"
                        value={draft?.to ?? ""}
                        onChange={(e) => setDraft(pkg.id, { to: e.target.value })}
                        className={input}
                      />
                    )}
                  </Field>
                  <button
                    type="button"
                    disabled={!dirty || savingId === pkg.id}
                    onClick={() => save(pkg)}
                    className="px-4 py-2 btn-admin disabled:opacity-40"
                  >
                    {savingId === pkg.id ? "Saving…" : "Save"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Toast message={toast} />
    </div>
  );
}
