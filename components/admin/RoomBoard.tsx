"use client";

import { useEffect, useState, useId } from "react";
import { useToast, Toast } from "@/components/ui/Toast";

type RoomStatus = {
  occupancy: string;
  housekeeping: string;
  notes?: string;
  lastCleanedAt?: string;
  currentGuest?: { firstName: string; lastName: string; phone: string } | null;
  currentBooking?: { id: string; checkOut: string; bookingNumber: string; adults: number; status: string } | null;
};

type DueCheckin = { id: string; guestName: string; bookingNumber: string };

type Room = {
  id: string;
  name: string;
  roomNumber?: string;
  roomType: string;
  floor?: number;
  roomStatus?: RoomStatus | null;
  dueCheckin?: DueCheckin | null;
};

type UpdateForm = { occupancy?: string; housekeeping?: string; notes?: string };

const OCCUPANCY_CONFIG: Record<string, { label: string; color: string }> = {
  vacant:       { label: "Vacant",        color: "bg-green-100 text-green-800 border-green-200" },
  occupied:     { label: "Occupied",      color: "bg-red-100 text-red-800 border-red-200" },
  due_checkout: { label: "Due Check-out", color: "bg-orange-100 text-orange-800 border-orange-200" },
  due_checkin:  { label: "Due Check-in",  color: "bg-blue-100 text-blue-800 border-blue-200" },
  out_of_order: { label: "Out of Order",  color: "bg-gray-100 text-gray-600 border-gray-200" },
};

const HK_CONFIG: Record<string, { label: string; color: string }> = {
  clean:        { label: "Clean",     color: "bg-emerald-100 text-emerald-700" },
  dirty:        { label: "Dirty",     color: "bg-red-100 text-red-700" },
  cleaning:     { label: "Cleaning",  color: "bg-yellow-100 text-yellow-700" },
  inspected:    { label: "Inspected", color: "bg-indigo-100 text-indigo-700" },
  out_of_order: { label: "OOO",       color: "bg-gray-100 text-gray-600" },
};

function OccBadge({ status }: { status: string }) {
  const cfg = OCCUPANCY_CONFIG[status] ?? { label: status, color: "bg-gray-100 text-gray-600 border-gray-200" };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>{cfg.label}</span>;
}

function HkBadge({ status }: { status: string }) {
  const cfg = HK_CONFIG[status] ?? { label: status, color: "bg-gray-100 text-gray-600" };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>{cfg.label}</span>;
}

/**
 * The live room board: one card per room, grouped by floor.
 *
 * `canCheckIn` mirrors the API gate on /api/admin/bookings/[id]/checkin — front
 * desk and above get the check-in / check-out buttons. Housekeeping still sees
 * every room and can update cleaning status, which its own API allows.
 */
export default function RoomBoard({ canCheckIn }: { canCheckIn: boolean }) {
  const fieldId = useId();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Room | null>(null);
  const [form, setForm] = useState<UpdateForm>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { toast, showToast } = useToast();

  async function load() {
    const res = await fetch("/api/admin/rooms/status");
    const data = await res.json();
    if (data.success) setRooms(data.data);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);


  async function handleCheckin(bookingId: string) {
    setActionLoading(bookingId);
    const res = await fetch(`/api/admin/bookings/${bookingId}/checkin`, { method: "PATCH" });
    const data = await res.json();
    if (data.success) { showToast(data.message ?? "Checked in successfully"); await load(); }
    else showToast(data.error ?? "Check-in failed");
    setActionLoading(null);
  }

  async function handleCheckout(bookingId: string) {
    setActionLoading(bookingId);
    const res = await fetch(`/api/admin/bookings/${bookingId}/checkout`, { method: "PATCH" });
    const data = await res.json();
    if (data.success) { showToast(data.message ?? "Checked out successfully"); await load(); }
    else showToast(data.error ?? "Check-out failed");
    setActionLoading(null);
  }

  function openPanel(room: Room) {
    setSelected(room);
    setForm({
      occupancy: room.roomStatus?.occupancy ?? "vacant",
      housekeeping: room.roomStatus?.housekeeping ?? "clean",
      notes: room.roomStatus?.notes ?? "",
    });
    setMsg("");
  }

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    setMsg("");
    const res = await fetch("/api/admin/rooms/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId: selected.id, ...form }),
    });
    const data = await res.json();
    if (data.success) { setMsg("Saved!"); await load(); setSelected(null); }
    else setMsg(data.error ?? "Error saving");
    setSaving(false);
  }

  const byFloor: Record<string, Room[]> = {};
  for (const r of rooms) {
    const key = r.floor != null ? `Floor ${r.floor}` : "Unassigned";
    (byFloor[key] ??= []).push(r);
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-medium text-gray-900">Rooms</h2>
        <button
          onClick={load}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading rooms…</div>
      ) : (
        Object.entries(byFloor).map(([floor, floorRooms]) => (
          <div key={floor} className="mb-6">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{floor}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {floorRooms.map((room) => {
                const occ = room.roomStatus?.occupancy ?? "vacant";
                const hk = room.roomStatus?.housekeeping ?? "clean";
                const guest = room.roomStatus?.currentGuest;
                const bk = room.roomStatus?.currentBooking;
                const checkinBookingId = room.dueCheckin?.id;
                return (
                  <div
                    key={room.id}
                    onClick={() => openPanel(room)}
                    className="text-left p-3 bg-white rounded-xl border border-gray-200 hover:border-primary hover:shadow-sm transition-all cursor-pointer"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <span className="text-lg font-bold text-gray-800">
                        {room.roomNumber ?? room.name}
                      </span>
                      <HkBadge status={hk} />
                    </div>
                    <div className="text-xs text-gray-500 mb-2 capitalize">{room.roomType}</div>
                    <OccBadge status={occ} />
                    {guest && (
                      <div className="mt-2 text-xs text-gray-600 truncate">
                        {guest.firstName} {guest.lastName}
                      </div>
                    )}
                    {bk && (
                      <div className="mt-0.5 text-xs text-gray-400">
                        Out: {new Date(bk.checkOut).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </div>
                    )}
                    {canCheckIn && occ === "due_checkin" && checkinBookingId && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleCheckin(checkinBookingId); }}
                        disabled={actionLoading === checkinBookingId}
                        className="mt-2 w-full py-1.5 text-xs font-medium bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-lg transition-colors"
                      >
                        {actionLoading === checkinBookingId ? "…" : "Check In"}
                      </button>
                    )}
                    {canCheckIn && (occ === "occupied" || occ === "due_checkout") && bk?.id && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleCheckout(bk.id); }}
                        disabled={actionLoading === bk.id}
                        className="mt-2 w-full py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white rounded-lg transition-colors"
                      >
                        {actionLoading === bk.id ? "…" : "Check Out"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {/* Update panel (slide-over) */}
      {selected && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setSelected(null)} />
          <div className="fixed right-0 top-0 bottom-0 z-50 w-80 bg-white shadow-xl flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <div className="font-semibold text-gray-900">
                  {selected.roomNumber ? `Room ${selected.roomNumber}` : selected.name}
                </div>
                <div className="text-xs text-gray-500 capitalize">{selected.roomType}</div>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-auto p-5 space-y-5">
              <div>
                <span id={`${fieldId}-occupancy-label`} className="block text-sm font-medium text-gray-700 mb-2">Occupancy Status</span>
                <div role="radiogroup" aria-labelledby={`${fieldId}-occupancy-label`} className="grid grid-cols-1 gap-1.5">
                  {Object.entries(OCCUPANCY_CONFIG).map(([val, cfg]) => (
                    <label key={val} className="flex items-center gap-2.5 cursor-pointer">
                      <input type="radio" name="occupancy" value={val}
                        checked={form.occupancy === val}
                        onChange={() => setForm((f) => ({ ...f, occupancy: val }))}
                        className="accent-primary" />
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${cfg.color}`}>{cfg.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <span id={`${fieldId}-housekeeping-label`} className="block text-sm font-medium text-gray-700 mb-2">Housekeeping Status</span>
                <div role="radiogroup" aria-labelledby={`${fieldId}-housekeeping-label`} className="grid grid-cols-1 gap-1.5">
                  {Object.entries(HK_CONFIG).map(([val, cfg]) => (
                    <label key={val} className="flex items-center gap-2.5 cursor-pointer">
                      <input type="radio" name="housekeeping" value={val}
                        checked={form.housekeeping === val}
                        onChange={() => setForm((f) => ({ ...f, housekeeping: val }))}
                        className="accent-primary" />
                      <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor={`${fieldId}-notes`} className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea id={`${fieldId}-notes`} rows={3} value={form.notes ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  placeholder="Maintenance note, guest request…" />
              </div>

              {msg && <p className={`text-sm ${msg === "Saved!" ? "text-green-600" : "text-red-600"}`}>{msg}</p>}
            </div>

            <div className="px-5 py-4 border-t">
              <button onClick={handleSave} disabled={saving}
                className="w-full py-2.5 btn-admin">
                {saving ? "Saving…" : "Update Status"}
              </button>
            </div>
          </div>
        </>
      )}

      <Toast message={toast} />
    </section>
  );
}
