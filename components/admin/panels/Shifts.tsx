"use client";

import { useEffect, useState, useCallback, useId } from "react";
import { useToast, Toast } from "@/components/ui/Toast";

type Staff = { id: string; name: string; role: string };

type Assignment = {
  id: string;
  date: string;
  slot: string;
  station: string;
  staffId: string;
  notes?: string | null;
  staff: Staff;
};

const SLOTS = [
  { id: "morning", label: "Morning", time: "7 AM – 3 PM" },
  { id: "evening", label: "Evening", time: "3 PM – 11 PM" },
  { id: "night",   label: "Night",   time: "11 PM – 7 AM" },
];

const STATIONS = [
  { id: "frontdesk", label: "Front Desk", color: "bg-blue-50 border-blue-200" },
  { id: "housekeeping", label: "Housekeeping", color: "bg-green-50 border-green-200" },
  { id: "kitchen", label: "Kitchen", color: "bg-amber-50 border-amber-200" },
];

function startOfWeek(d: Date) {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  const day = out.getDay(); // 0 Sun
  const diff = day === 0 ? -6 : 1 - day; // make Monday the start
  out.setDate(out.getDate() + diff);
  return out;
}

function addDays(d: Date, n: number) { const o = new Date(d); o.setDate(o.getDate() + n); return o; }

function toISO(d: Date) { return d.toISOString().split("T")[0]; }

function fmtDay(d: Date) {
  return { dayName: d.toLocaleDateString("en-IN", { weekday: "short" }), dayNum: d.getDate(), monthShort: d.toLocaleDateString("en-IN", { month: "short" }) };
}

export default function ShiftsPanel() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ date: string; slot: string; station: string; existing?: Assignment } | null>(null);
  const { toast, showToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/shifts?weekStart=${toISO(weekStart)}`);
    const data = await res.json();
    if (data.success) { setAssignments(data.data.assignments); setStaff(data.data.staff); }
    setLoading(false);
  }, [weekStart]);

  useEffect(() => { load(); }, [load]);


  function getAssignment(dateISO: string, slot: string, station: string): Assignment | undefined {
    return assignments.find((a) => a.date.split("T")[0] === dateISO && a.slot === slot && a.station === station);
  }

  async function saveAssignment(staffId: string, notes: string) {
    if (!editing) return;
    const res = await fetch("/api/admin/shifts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: editing.date, slot: editing.slot, station: editing.station, staffId, notes: notes || null }),
    });
    const data = await res.json();
    if (data.success) { showToast("Saved"); setEditing(null); load(); }
    else showToast(data.error ?? "Save failed");
  }

  async function deleteAssignment(id: string) {
    const res = await fetch(`/api/admin/shifts/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.success) { showToast("Cleared"); setEditing(null); load(); }
    else showToast(data.error ?? "Delete failed");
  }

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-end gap-3 mb-6 print:hidden">
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50">This Week</button>
          <button onClick={() => setWeekStart(addDays(weekStart, -7))}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">← Prev</button>
          <span className="text-sm font-medium text-gray-700 mx-1 min-w-[180px] text-center">
            {weekStart.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – {addDays(weekStart, 6).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
          </span>
          <button onClick={() => setWeekStart(addDays(weekStart, 7))}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Next →</button>
          <button onClick={() => window.print()}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 ml-2">Print</button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-400">Loading schedule…</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b-2 border-gray-200 bg-gray-50">
                <th className="text-left px-3 py-3 font-medium text-gray-500 sticky left-0 bg-gray-50 z-10 min-w-[120px]">Shift</th>
                {days.map((d, i) => {
                  const { dayName, dayNum, monthShort } = fmtDay(d);
                  const isToday = toISO(d) === toISO(new Date());
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  return (
                    <th key={i} className={`text-center px-3 py-3 font-medium min-w-[140px] ${isToday ? "bg-primary/10" : ""}`}>
                      <div className={`text-xs ${isToday ? "text-primary" : isWeekend ? "text-amber-600" : "text-gray-500"}`}>{dayName}</div>
                      <div className={`text-base font-bold ${isToday ? "text-primary" : "text-gray-700"}`}>{dayNum}</div>
                      <div className="text-[10px] text-gray-400">{monthShort}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {SLOTS.map((slot) => (
                STATIONS.map((station, stationIdx) => (
                  <tr key={`${slot.id}-${station.id}`} className={`border-b border-gray-100 ${stationIdx === 0 ? "border-t-2 border-t-gray-200" : ""}`}>
                    <td className="px-3 py-3 sticky left-0 bg-white z-10">
                      {stationIdx === 0 && (
                        <>
                          <div className="font-semibold text-gray-800 text-sm">{slot.label}</div>
                          <div className="text-[10px] text-gray-400">{slot.time}</div>
                        </>
                      )}
                      <div className={`mt-${stationIdx === 0 ? "1" : "0"} text-xs font-medium text-gray-600`}>{station.label}</div>
                    </td>
                    {days.map((d, i) => {
                      const dateISO = toISO(d);
                      const a = getAssignment(dateISO, slot.id, station.id);
                      return (
                        <td key={i} className="p-1.5 align-top">
                          <button onClick={() => setEditing({ date: dateISO, slot: slot.id, station: station.id, existing: a })}
                            className={`w-full p-2 rounded-lg border-2 text-left transition-all ${
                              a ? `${station.color} hover:shadow-sm` : "border-dashed border-gray-200 hover:border-primary hover:bg-gray-50"
                            }`}>
                            {a ? (
                              <div>
                                <div className="text-xs font-semibold text-gray-800 truncate">{a.staff.name}</div>
                                <div className="text-[10px] text-gray-500 capitalize">{a.staff.role}</div>
                              </div>
                            ) : (
                              <div className="text-[11px] text-gray-400 text-center py-1">+ Assign</div>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 print:hidden">
        {STATIONS.map((s) => (
          <div key={s.id} className="flex items-center gap-1.5 text-xs">
            <div className={`w-3 h-3 rounded ${s.color.split(" ")[0]}`} />
            <span className="text-gray-500">{s.label}</span>
          </div>
        ))}
      </div>

      <Toast message={toast} className="print:hidden" />

      {editing && (
        <EditAssignmentModal
          editing={editing}
          staff={staff}
          onSave={saveAssignment}
          onDelete={deleteAssignment}
          onClose={() => setEditing(null)}
        />
      )}

      <style jsx global>{`
        @media print {
          @page { size: landscape; margin: 1cm; }
          body { background: white !important; }
        }
      `}</style>
    </div>
  );
}

// ─── Edit Assignment Modal ────────────────────────────────────────────────────

function EditAssignmentModal({
  editing, staff, onSave, onDelete, onClose,
}: {
  editing: { date: string; slot: string; station: string; existing?: Assignment };
  staff: Staff[];
  onSave: (staffId: string, notes: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const fieldId = useId();
  const [staffId, setStaffId] = useState(editing.existing?.staffId ?? "");
  const [notes, setNotes] = useState(editing.existing?.notes ?? "");
  const slotLabel = SLOTS.find((s) => s.id === editing.slot)?.label ?? editing.slot;
  const stationLabel = STATIONS.find((s) => s.id === editing.station)?.label ?? editing.station;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
          <div className="px-6 py-4 border-b">
            <h2 className="font-semibold text-gray-900">{editing.existing ? "Edit Assignment" : "Assign Staff"}</h2>
            <p className="text-xs text-gray-500 mt-1">
              {new Date(editing.date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })} · {slotLabel} · {stationLabel}
            </p>
          </div>

          <div className="p-6 space-y-4">
            <div>
              <label htmlFor={`${fieldId}-staff-member`} className="block text-sm font-medium text-gray-700 mb-1">Staff Member *</label>
              <select id={`${fieldId}-staff-member`} value={staffId} onChange={(e) => setStaffId(e.target.value)}
                className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg bg-white">
                <option value="">Select staff…</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}
              </select>
            </div>

            <div>
              <label htmlFor={`${fieldId}-notes`} className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea id={`${fieldId}-notes`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="Cover details, swap notes, etc."
                className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg resize-none" />
            </div>

            <div className="flex gap-3 pt-2">
              {editing.existing && (
                <button onClick={() => onDelete(editing.existing!.id)}
                  className="px-3 py-2.5 text-red-600 border border-red-200 rounded-lg text-sm hover:bg-red-50">
                  Clear
                </button>
              )}
              <button onClick={onClose}
                className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={() => staffId && onSave(staffId, notes)} disabled={!staffId}
                className="flex-1 py-2.5 btn-admin">
                {editing.existing ? "Update" : "Assign"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
