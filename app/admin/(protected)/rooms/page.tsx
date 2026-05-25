"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

type RoomStatus = {
  occupancy: string;
  housekeeping: string;
  notes?: string;
  lastCleanedAt?: string;
  currentGuest?: { firstName: string; lastName: string; phone: string } | null;
  currentBooking?: { checkOut: string; bookingNumber: string; adults: number } | null;
};

type Room = {
  id: string;
  name: string;
  roomNumber?: string;
  roomType: string;
  floor?: number;
  roomStatus?: RoomStatus | null;
};

type UpdateForm = { occupancy?: string; housekeeping?: string; notes?: string };

type GridBooking = {
  id: string;
  bookingNumber: string;
  guestName: string;
  roomId: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  status: string;
  adults: number;
};

type GridRoom = { id: string; name: string; roomNumber?: string; roomType: string; floor?: number };

// ─── Config ───────────────────────────────────────────────────────────────────

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

const GRID_STATUS_COLOR: Record<string, { bar: string; text: string }> = {
  confirmed:   { bar: "bg-blue-500",   text: "text-white" },
  checked_in:  { bar: "bg-[#4A6741]",  text: "text-white" },
  checked_out: { bar: "bg-gray-300",   text: "text-gray-600" },
};

const COL_W  = 56;  // px per day
const ROW_H  = 52;  // px per room row
const LABEL_W = 148; // px for room name column
const DAYS   = 14;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function addDays(date: Date, n: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function dayDiffFromToday(dateStr: string, today: Date) {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

function fmtShortDate(d: Date) {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

// ─── Badges ───────────────────────────────────────────────────────────────────

function OccBadge({ status }: { status: string }) {
  const cfg = OCCUPANCY_CONFIG[status] ?? { label: status, color: "bg-gray-100 text-gray-600 border-gray-200" };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>{cfg.label}</span>;
}

function HkBadge({ status }: { status: string }) {
  const cfg = HK_CONFIG[status] ?? { label: status, color: "bg-gray-100 text-gray-600" };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>{cfg.label}</span>;
}

// ─── Occupancy Grid ───────────────────────────────────────────────────────────

function OccupancyGrid() {
  const [rooms, setRooms] = useState<GridRoom[]>([]);
  const [bookings, setBookings] = useState<GridBooking[]>([]);
  const [loading, setLoading] = useState(true);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: DAYS }, (_, i) => addDays(today, i));

  useEffect(() => {
    fetch("/api/admin/occupancy")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) { setRooms(d.rooms); setBookings(d.bookings); }
        setLoading(false);
      });
  }, []);

  const byRoom: Record<string, GridBooking[]> = {};
  for (const b of bookings) (byRoom[b.roomId] ??= []).push(b);

  const byFloor: Record<string, GridRoom[]> = {};
  for (const r of rooms) {
    const key = r.floor != null ? `Floor ${r.floor}` : "Other";
    (byFloor[key] ??= []).push(r);
  }

  if (loading) return <div className="py-16 text-center text-gray-400">Loading grid…</div>;

  const totalWidth = LABEL_W + DAYS * COL_W;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <div style={{ minWidth: totalWidth }}>

          {/* Date header */}
          <div className="flex border-b-2 border-gray-200 bg-gray-50 sticky top-0 z-20">
            <div
              style={{ width: LABEL_W, minWidth: LABEL_W }}
              className="flex-shrink-0 px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide border-r border-gray-200 sticky left-0 bg-gray-50 z-30"
            >
              Room
            </div>
            {days.map((day, i) => {
              const isToday = i === 0;
              const isWeekend = day.getDay() === 0 || day.getDay() === 6;
              return (
                <div
                  key={i}
                  style={{ width: COL_W, minWidth: COL_W }}
                  className={`flex-shrink-0 flex flex-col items-center justify-center py-2 border-r border-gray-200 ${isToday ? "bg-[#4A6741]/10" : ""}`}
                >
                  <span className={`text-xs font-medium ${isToday ? "text-[#4A6741]" : isWeekend ? "text-amber-600" : "text-gray-400"}`}>
                    {day.toLocaleDateString("en-IN", { weekday: "short" })}
                  </span>
                  <span className={`text-sm font-bold leading-tight ${isToday ? "text-[#4A6741]" : isWeekend ? "text-amber-700" : "text-gray-700"}`}>
                    {day.getDate()}
                  </span>
                  {isToday && <span className="text-[9px] text-[#4A6741] font-semibold uppercase tracking-wide">Today</span>}
                </div>
              );
            })}
          </div>

          {/* Room rows grouped by floor */}
          {Object.entries(byFloor).map(([floor, floorRooms]) => (
            <div key={floor}>
              {/* Floor label */}
              <div className="flex border-b border-gray-100 bg-gray-50/70">
                <div
                  style={{ width: LABEL_W, minWidth: LABEL_W }}
                  className="flex-shrink-0 px-4 py-1.5 sticky left-0 bg-gray-50/70 z-10"
                >
                  <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">{floor}</span>
                </div>
                <div style={{ width: DAYS * COL_W }} className="flex-shrink-0">
                  {/* Today highlight stripe */}
                  <div style={{ width: COL_W, marginLeft: 0, height: "100%" }} className="bg-[#4A6741]/5 inline-block" />
                </div>
              </div>

              {/* Room rows */}
              {floorRooms.map((room, rowIdx) => {
                const roomBookings = byRoom[room.id] ?? [];
                const isLast = rowIdx === floorRooms.length - 1;
                return (
                  <div key={room.id} className={`flex ${isLast ? "border-b-2 border-gray-200" : "border-b border-gray-100"} hover:bg-amber-50/20 transition-colors`}>
                    {/* Room label — sticky */}
                    <div
                      style={{ width: LABEL_W, minWidth: LABEL_W, height: ROW_H }}
                      className="flex-shrink-0 px-4 flex items-center gap-3 border-r border-gray-200 sticky left-0 bg-white z-10 hover:bg-amber-50/20"
                    >
                      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-gray-600">{room.roomNumber ?? room.name.slice(0, 3)}</span>
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-gray-800 truncate">
                          {room.roomNumber ? `#${room.roomNumber}` : room.name}
                        </div>
                        <div className="text-xs text-gray-400 capitalize truncate">{room.roomType}</div>
                      </div>
                    </div>

                    {/* Day grid */}
                    <div style={{ width: DAYS * COL_W, height: ROW_H }} className="relative flex-shrink-0">
                      {/* Background grid lines + today highlight */}
                      {days.map((_, i) => (
                        <div
                          key={i}
                          style={{ position: "absolute", left: i * COL_W, width: COL_W, top: 0, bottom: 0 }}
                          className={`border-r border-gray-100 ${i === 0 ? "bg-[#4A6741]/5" : ""}`}
                        />
                      ))}

                      {/* Booking bars */}
                      {roomBookings.map((b) => {
                        const startDay = dayDiffFromToday(b.checkIn, today);
                        const endDay = dayDiffFromToday(b.checkOut, today);
                        const clampedStart = Math.max(0, startDay);
                        const clampedEnd = Math.min(DAYS, endDay);
                        if (clampedEnd <= clampedStart) return null;

                        const left = clampedStart * COL_W + 3;
                        const width = (clampedEnd - clampedStart) * COL_W - 6;
                        const cfg = GRID_STATUS_COLOR[b.status] ?? { bar: "bg-gray-400", text: "text-white" };
                        const startsBeforeGrid = startDay < 0;
                        const endsAfterGrid = endDay > DAYS;

                        return (
                          <Link
                            key={b.id}
                            href={`/admin/bookings/${b.id}`}
                            style={{ position: "absolute", left, width, top: 9, height: 34 }}
                            className={`${cfg.bar} ${cfg.text} flex items-center px-2.5 gap-1.5 overflow-hidden hover:opacity-90 hover:shadow-md transition-all group z-10
                              ${startsBeforeGrid ? "rounded-r-lg" : "rounded-l-lg"}
                              ${endsAfterGrid ? "rounded-l-lg" : "rounded-r-lg"}
                              ${!startsBeforeGrid && !endsAfterGrid ? "rounded-lg" : ""}
                            `}
                            title={`${b.guestName} · ${b.bookingNumber} · ${fmtShortDate(new Date(b.checkIn))} – ${fmtShortDate(new Date(b.checkOut))} (${b.nights}N)`}
                          >
                            {startsBeforeGrid && (
                              <svg className="w-3 h-3 flex-shrink-0 opacity-70" fill="currentColor" viewBox="0 0 8 8">
                                <path d="M6 0L0 4l6 4V0z"/>
                              </svg>
                            )}
                            <span className="text-xs font-medium truncate leading-none">
                              {b.guestName.split(" ")[0]}
                            </span>
                            {width > 80 && (
                              <span className="text-[10px] opacity-75 truncate hidden group-hover:block">
                                {b.nights}N
                              </span>
                            )}
                            {endsAfterGrid && (
                              <svg className="w-3 h-3 flex-shrink-0 opacity-70 ml-auto" fill="currentColor" viewBox="0 0 8 8">
                                <path d="M2 0l6 4-6 4V0z"/>
                              </svg>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-5 px-5 py-3 border-t border-gray-100 bg-gray-50">
        <span className="text-xs text-gray-400 font-medium">Legend:</span>
        {[
          { color: "bg-[#4A6741]", label: "Checked In" },
          { color: "bg-blue-500",  label: "Confirmed" },
          { color: "bg-gray-300",  label: "Checked Out" },
          { color: "bg-[#4A6741]/5 border border-[#4A6741]/20", label: "Today" },
          { color: "bg-amber-50 border border-amber-200",       label: "Weekend" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className={`w-3.5 h-3.5 rounded ${color}`} />
            <span className="text-xs text-gray-500">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FrontDeskPage() {
  const [tab, setTab] = useState<"cards" | "grid">("cards");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Room | null>(null);
  const [form, setForm] = useState<UpdateForm>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    const res = await fetch("/api/admin/rooms/status");
    const data = await res.json();
    if (data.success) setRooms(data.rooms);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

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
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Front Desk</h1>
          <p className="text-sm text-gray-500 mt-0.5">Room occupancy and availability</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Tab switcher */}
          <div className="flex bg-gray-100 rounded-lg p-1 gap-0.5">
            <button
              onClick={() => setTab("cards")}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                tab === "cards" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Room Cards
            </button>
            <button
              onClick={() => setTab("grid")}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-1.5 ${
                tab === "grid" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Occupancy Grid
            </button>
          </div>

          {tab === "cards" && (
            <button
              onClick={load}
              className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          )}
        </div>
      </div>

      {/* ── Cards tab ── */}
      {tab === "cards" && (
        <>
          {/* Legend */}
          <div className="flex flex-wrap gap-3 mb-6 p-3 bg-white rounded-lg border border-gray-200">
            <span className="text-xs text-gray-500 font-medium self-center">Occupancy:</span>
            {Object.entries(OCCUPANCY_CONFIG).map(([k, v]) => (
              <span key={k} className={`text-xs px-2 py-0.5 rounded-full border ${v.color}`}>{v.label}</span>
            ))}
            <span className="text-xs text-gray-400 mx-1">|</span>
            <span className="text-xs text-gray-500 font-medium self-center">HK:</span>
            {Object.entries(HK_CONFIG).map(([k, v]) => (
              <span key={k} className={`text-xs px-2 py-0.5 rounded-full ${v.color}`}>{v.label}</span>
            ))}
          </div>

          {loading ? (
            <div className="text-center py-16 text-gray-400">Loading rooms…</div>
          ) : (
            Object.entries(byFloor).map(([floor, floorRooms]) => (
              <div key={floor} className="mb-8">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">{floor}</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {floorRooms.map((room) => {
                    const occ = room.roomStatus?.occupancy ?? "vacant";
                    const hk = room.roomStatus?.housekeeping ?? "clean";
                    const guest = room.roomStatus?.currentGuest;
                    const bk = room.roomStatus?.currentBooking;
                    return (
                      <button
                        key={room.id}
                        onClick={() => openPanel(room)}
                        className="text-left p-3 bg-white rounded-xl border border-gray-200 hover:border-[#4A6741] hover:shadow-sm transition-all"
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
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </>
      )}

      {/* ── Grid tab ── */}
      {tab === "grid" && <OccupancyGrid />}

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
                <label className="block text-sm font-medium text-gray-700 mb-2">Occupancy Status</label>
                <div className="grid grid-cols-1 gap-1.5">
                  {Object.entries(OCCUPANCY_CONFIG).map(([val, cfg]) => (
                    <label key={val} className="flex items-center gap-2.5 cursor-pointer">
                      <input type="radio" name="occupancy" value={val}
                        checked={form.occupancy === val}
                        onChange={() => setForm((f) => ({ ...f, occupancy: val }))}
                        className="accent-[#4A6741]" />
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${cfg.color}`}>{cfg.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Housekeeping Status</label>
                <div className="grid grid-cols-1 gap-1.5">
                  {Object.entries(HK_CONFIG).map(([val, cfg]) => (
                    <label key={val} className="flex items-center gap-2.5 cursor-pointer">
                      <input type="radio" name="housekeeping" value={val}
                        checked={form.housekeeping === val}
                        onChange={() => setForm((f) => ({ ...f, housekeeping: val }))}
                        className="accent-[#4A6741]" />
                      <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea rows={3} value={form.notes ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4A6741] resize-none"
                  placeholder="Maintenance note, guest request…" />
              </div>

              {msg && <p className={`text-sm ${msg === "Saved!" ? "text-green-600" : "text-red-600"}`}>{msg}</p>}
            </div>

            <div className="px-5 py-4 border-t">
              <button onClick={handleSave} disabled={saving}
                className="w-full py-2.5 bg-[#4A6741] hover:bg-[#3d5636] disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors">
                {saving ? "Saving…" : "Update Status"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
