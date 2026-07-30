"use client";

import { useEffect, useState, useCallback } from "react";

type BlockedDate = {
  id: string;
  blockDate: string;
  reason?: string | null;
  createdAt: string;
  room?: { name: string; roomNumber?: string | null; roomType: string } | null;
};

type Room = { id: string; name: string; roomNumber?: string | null; roomType: string };

export default function BlockedDatesPanel() {
  const [blocked, setBlocked] = useState<BlockedDate[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [blockedRes, roomsRes] = await Promise.all([
      fetch("/api/admin/blocked-dates"),
      fetch("/api/admin/rooms/status"),
    ]);
    const blockedData = await blockedRes.json();
    const roomsData = await roomsRes.json();
    if (blockedData.success) setBlocked(blockedData.blocked);
    if (roomsData.success) setRooms(roomsData.rooms);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    const res = await fetch(`/api/admin/blocked-dates/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.success) { showToast("Removed"); await load(); }
    else showToast(data.error ?? "Delete failed");
    setDeletingId(null);
  }

  // Group by date for display
  const grouped: Record<string, BlockedDate[]> = {};
  for (const b of blocked) {
    const key = b.blockDate.split("T")[0];
    (grouped[key] ??= []).push(b);
  }

  const sortedDates = Object.keys(grouped).sort();

  return (
    <div className="p-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-end gap-3 mb-6">
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[#4A6741] hover:bg-[#3d5636] text-white text-sm font-medium rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Block Dates
        </button>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl mb-6">
        <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-sm text-amber-700">
          Blocked dates are hidden from the booking availability check. Use this to block dates for maintenance, private events, or seasonal closures.
          Blocking &ldquo;All Rooms&rdquo; will block availability for all room types on that date.
        </p>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading…</div>
      ) : blocked.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="text-gray-500 font-medium">No upcoming blocked dates</div>
          <div className="text-sm text-gray-400 mt-1">All dates are open for bookings</div>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedDates.map((dateStr) => {
            const dayBlocked = grouped[dateStr];
            const date = new Date(dateStr + "T00:00:00");
            const dayLabel = date.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
            return (
              <div key={dateStr} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className={`px-5 py-3 border-b border-gray-100 flex items-center gap-3 ${isWeekend ? "bg-amber-50" : "bg-gray-50"}`}>
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-sm font-semibold text-gray-800">{dayLabel}</span>
                  {isWeekend && <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">Weekend</span>}
                  <span className="ml-auto text-xs text-gray-400">{dayBlocked.length} block{dayBlocked.length !== 1 ? "s" : ""}</span>
                </div>
                <table className="min-w-full text-sm">
                  <tbody className="divide-y divide-gray-50">
                    {dayBlocked.map((b) => (
                      <tr key={b.id} className="hover:bg-gray-50">
                        <td className="px-5 py-3">
                          {b.room ? (
                            <div>
                              <span className="font-medium text-gray-900">
                                {b.room.roomNumber ? `#${b.room.roomNumber} — ` : ""}{b.room.name}
                              </span>
                              <span className="ml-2 text-xs text-gray-400 capitalize">{b.room.roomType}</span>
                            </div>
                          ) : (
                            <span className="font-medium text-gray-700">All Rooms</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-gray-500">
                          {b.reason || <span className="italic text-gray-300">No reason</span>}
                        </td>
                        <td className="px-5 py-3 text-xs text-gray-400 text-right">
                          Added {new Date(b.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button
                            onClick={() => handleDelete(b.id)}
                            disabled={deletingId === b.id}
                            className="px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
                          >
                            {deletingId === b.id ? "…" : "Remove"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 bg-gray-900 text-white text-sm px-4 py-3 rounded-lg shadow-lg z-50">
          {toast}
        </div>
      )}

      {showAdd && <BlockDatesModal rooms={rooms} onClose={() => { setShowAdd(false); load(); }} />}
    </div>
  );
}

// ─── Block Dates Modal ────────────────────────────────────────────────────────

function BlockDatesModal({ rooms, onClose }: { rooms: Room[]; onClose: () => void }) {
  const today = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState({ roomId: "", startDate: today, endDate: today, reason: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/admin/blocked-dates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomId: form.roomId || null,
        startDate: form.startDate,
        endDate: form.endDate,
        reason: form.reason || undefined,
      }),
    });
    const data = await res.json();
    if (data.success) onClose();
    else setError(data.error ?? "Failed to block dates");
    setLoading(false);
  }

  const nightCount = (() => {
    if (!form.startDate || !form.endDate) return 0;
    const diff = new Date(form.endDate).getTime() - new Date(form.startDate).getTime();
    return Math.max(0, Math.round(diff / 86400000)) + 1;
  })();

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <h2 className="font-semibold text-gray-900">Block Dates</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Room</label>
              <select
                value={form.roomId}
                onChange={(e) => setForm((f) => ({ ...f, roomId: e.target.value }))}
                className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4A6741] bg-white"
              >
                <option value="">All Rooms</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.roomNumber ? `#${r.roomNumber} — ` : ""}{r.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
                <input
                  type="date"
                  required
                  min={today}
                  value={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                  className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4A6741]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date *</label>
                <input
                  type="date"
                  required
                  min={form.startDate || today}
                  value={form.endDate}
                  onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                  className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4A6741]"
                />
              </div>
            </div>

            {nightCount > 0 && (
              <p className="text-xs text-gray-500">
                Blocking <span className="font-semibold text-gray-800">{nightCount} day{nightCount !== 1 ? "s" : ""}</span>
                {!form.roomId && " across all rooms"}
              </p>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
              <input
                type="text"
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="e.g. Private event, maintenance, seasonal closure…"
                maxLength={200}
                className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4A6741]"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose}
                className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={loading}
                className="flex-1 py-2.5 bg-[#4A6741] hover:bg-[#3d5636] disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors">
                {loading ? "Blocking…" : "Block Dates"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
