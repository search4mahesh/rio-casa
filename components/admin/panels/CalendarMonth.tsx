"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { apiJson } from "@/lib/api-client";

const COL_W = 40;
const ROW_H = 50;
const LABEL_W = 148;

// Stacking order inside the scroll area. The frozen room-label column has to
// sit above the booking bars: at equal z-index the bars win on DOM order and
// slide over the labels as soon as the grid is scrolled sideways.
const Z_BAR = "z-10";
const Z_STICKY_LABEL = "z-20";
const Z_HEADER_CORNER = "z-30";

// A rolling window, not a calendar month. Starting rigidly at the 1st meant
// the view always opened on history nobody needed and cut off the end of the
// month; a window anchored a little before today shows what the front desk
// actually cares about — who is in now, and who is arriving next.
const DAYS_BEFORE = 7;
const RANGE_DAYS = 90;
const NUDGE_DAYS = 14; // how far the ‹ › buttons shift the window

type CalBook = {
  id: string; bookingNumber: string; guestName: string; roomId: string;
  checkIn: string; checkOut: string; nights: number; status: string; adults: number; totalAmount: number;
};
type CalRoom = { id: string; name: string; roomNumber?: string | null; roomType: string; floor?: number | null };
type CalBlocked = { id: string; roomId: string | null; blockDate: string; reason?: string | null };
type CalData = { rooms: CalRoom[]; bookings: CalBook[]; blockedDates: CalBlocked[] };

const STATUS_CFG: Record<string, { bar: string; text: string; label: string }> = {
  confirmed:   { bar: "bg-blue-500",   text: "text-white", label: "Confirmed" },
  checked_in:  { bar: "bg-primary",    text: "text-white", label: "Checked In" },
  checked_out: { bar: "bg-gray-400",   text: "text-white", label: "Checked Out" },
  no_show:     { bar: "bg-orange-400", text: "text-white", label: "No Show" },
};

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(d: Date, n: number): Date {
  const o = new Date(d);
  o.setDate(o.getDate() + n);
  return o;
}
/** Stable per-day key. Keying by getDate() collides across months. */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** Parse a date-only value without letting the timezone shift the day. */
function localDate(iso: string): Date {
  const [y, m, d] = iso.split("T")[0].split("-").map(Number);
  return new Date(y, m - 1, d);
}
function daysBetween(a: Date, b: Date): number {
  return Math.round((Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) -
                     Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())) / 86400000);
}

export default function CalendarMonthPanel() {
  const today = startOfDay(new Date());
  const [rangeStart, setRangeStart] = useState(() => addDays(startOfDay(new Date()), -DAYS_BEFORE));
  const [data, setData] = useState<CalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CalBook | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const d = await apiJson(`/api/admin/calendar?from=${dayKey(rangeStart)}&days=${RANGE_DAYS}`);
    if (d.success) setData(d.data);
    setLoading(false);
  }, [rangeStart]);

  useEffect(() => { load(); }, [load]);

  const days = Array.from({ length: RANGE_DAYS }, (_, i) => addDays(rangeStart, i));
  const todayOffset = daysBetween(today, rangeStart);

  // Open with today just inside the left edge rather than at the far left, so
  // the immediately-preceding days stay glanceable.
  useEffect(() => {
    if (loading) return;
    const el = scrollRef.current;
    if (!el || todayOffset < 0) return;
    el.scrollLeft = Math.max(0, (todayOffset - 2) * COL_W);
  }, [loading, todayOffset]);

  const blockedSet = new Set<string>();
  for (const bd of data?.blockedDates ?? []) {
    const key = dayKey(localDate(bd.blockDate));
    blockedSet.add(bd.roomId ? `${bd.roomId}:${key}` : `all:${key}`);
  }

  const byRoom: Record<string, CalBook[]> = {};
  for (const b of data?.bookings ?? []) (byRoom[b.roomId] ??= []).push(b);

  const byFloor: Record<string, CalRoom[]> = {};
  for (const r of data?.rooms ?? []) {
    (byFloor[r.floor != null ? `Floor ${r.floor}` : "Other"] ??= []).push(r);
  }

  const totalWidth = LABEL_W + RANGE_DAYS * COL_W;
  const rangeEnd = addDays(rangeStart, RANGE_DAYS - 1);
  const rangeLabel =
    rangeStart.getFullYear() === rangeEnd.getFullYear()
      ? `${rangeStart.toLocaleString("en-IN", { month: "short" })} – ${rangeEnd.toLocaleString("en-IN", { month: "short" })} ${rangeEnd.getFullYear()}`
      : `${rangeStart.toLocaleString("en-IN", { month: "short", year: "numeric" })} – ${rangeEnd.toLocaleString("en-IN", { month: "short", year: "numeric" })}`;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-semibold text-gray-800">{rangeLabel}</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => setRangeStart(addDays(rangeStart, -NUDGE_DAYS))}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors" title={`Back ${NUDGE_DAYS} days`}>
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button onClick={() => setRangeStart(addDays(startOfDay(new Date()), -DAYS_BEFORE))}
            className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors">
            Today
          </button>
          <button onClick={() => setRangeStart(addDays(rangeStart, NUDGE_DAYS))}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors" title={`Forward ${NUDGE_DAYS} days`}>
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button onClick={load} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1.5 ml-1 transition-colors">
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mb-4 px-4 py-2.5 bg-white rounded-lg border border-gray-200 text-xs">
        {Object.entries(STATUS_CFG).map(([, { bar, label }]) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded-sm ${bar}`} />
            <span className="text-gray-500">{label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundImage: "repeating-linear-gradient(-45deg,#fee2e2 0,#fee2e2 2px,#fff5f5 2px,#fff5f5 6px)" }} />
          <span className="text-gray-500">Blocked</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-primary/10 border border-primary/30" />
          <span className="text-gray-500">Today</span>
        </div>
        <span className="ml-auto text-gray-400">Scroll sideways for more dates →</span>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-400">Loading calendar…</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200">
          <div ref={scrollRef} className="overflow-x-auto rounded-xl">
            <div style={{ minWidth: totalWidth }}>

              {/* Day header */}
              <div className="flex border-b-2 border-gray-200 bg-gray-50">
                <div style={{ width: LABEL_W, minWidth: LABEL_W }}
                  className={`flex-shrink-0 px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide border-r border-gray-200 sticky left-0 bg-gray-50 ${Z_HEADER_CORNER}`}>
                  Room
                </div>
                {days.map((dt, i) => {
                  const isToday = daysBetween(dt, today) === 0;
                  const isWeekend = dt.getDay() === 0 || dt.getDay() === 6;
                  const isMonthStart = dt.getDate() === 1 || i === 0;
                  return (
                    <div key={dayKey(dt)} style={{ width: COL_W, minWidth: COL_W }}
                      className={`flex-shrink-0 flex flex-col items-center justify-center py-1.5 border-gray-200 ${isMonthStart ? "border-l-2 border-l-gray-300" : "border-r"} ${isToday ? "bg-primary/10" : ""}`}>
                      <span className={`text-[9px] font-medium leading-none mb-0.5 ${isToday ? "text-primary" : isWeekend ? "text-amber-500" : "text-gray-400"}`}>
                        {isMonthStart
                          ? dt.toLocaleDateString("en-IN", { month: "short" })
                          : dt.toLocaleDateString("en-IN", { weekday: "narrow" })}
                      </span>
                      <span className={`text-sm font-bold ${isToday ? "text-primary" : isWeekend ? "text-amber-700" : "text-gray-700"}`}>
                        {dt.getDate()}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Room rows grouped by floor */}
              {Object.entries(byFloor).map(([floor, floorRooms]) => (
                <div key={floor}>
                  <div className="flex bg-gray-50/70 border-b border-gray-100">
                    <div style={{ width: LABEL_W, minWidth: LABEL_W }}
                      className={`flex-shrink-0 px-4 py-1 sticky left-0 bg-gray-50/70 ${Z_STICKY_LABEL}`}>
                      <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">{floor}</span>
                    </div>
                    <div style={{ width: RANGE_DAYS * COL_W }} className="flex-shrink-0" />
                  </div>

                  {floorRooms.map((room, idx) => {
                    const roomBooks = byRoom[room.id] ?? [];
                    return (
                      <div key={room.id}
                        className={`flex hover:bg-amber-50/20 transition-colors ${idx === floorRooms.length - 1 ? "border-b-2 border-gray-200" : "border-b border-gray-100"}`}>
                        {/* Room label sticky */}
                        <div style={{ width: LABEL_W, minWidth: LABEL_W, height: ROW_H }}
                          className={`flex-shrink-0 flex items-center px-4 gap-2.5 border-r border-gray-200 sticky left-0 bg-white ${Z_STICKY_LABEL}`}>
                          <div className="w-7 h-7 rounded bg-gray-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-bold text-gray-600">{room.roomNumber ?? room.name.slice(0, 2)}</span>
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-gray-800 truncate">
                              {room.roomNumber ? `#${room.roomNumber}` : room.name}
                            </div>
                            <div className="text-xs text-gray-400 capitalize truncate">{room.roomType}</div>
                          </div>
                        </div>

                        {/* Grid area with background cells + booking bars */}
                        <div style={{ width: RANGE_DAYS * COL_W, height: ROW_H }} className="relative flex-shrink-0">
                          <div className="absolute inset-0 flex">
                            {days.map((dt, i) => {
                              const key = dayKey(dt);
                              const isToday = daysBetween(dt, today) === 0;
                              const isWeekend = dt.getDay() === 0 || dt.getDay() === 6;
                              const isMonthStart = dt.getDate() === 1 || i === 0;
                              const isBlocked = blockedSet.has(`${room.id}:${key}`) || blockedSet.has(`all:${key}`);
                              return (
                                <div key={key} style={{
                                  width: COL_W, minWidth: COL_W,
                                  ...(isBlocked ? { backgroundImage: "repeating-linear-gradient(-45deg,#fee2e2 0,#fee2e2 2px,#fff5f5 2px,#fff5f5 6px)" } : {}),
                                }}
                                  className={`flex-shrink-0 h-full border-gray-100 ${isMonthStart ? "border-l-2 border-l-gray-300" : "border-r"} ${isToday && !isBlocked ? "bg-primary/5" : isWeekend && !isBlocked ? "bg-amber-50/30" : ""}`}
                                />
                              );
                            })}
                          </div>

                          {/* Booking bars */}
                          {roomBooks.map((b) => {
                            const checkIn = localDate(b.checkIn);
                            const checkOut = localDate(b.checkOut);
                            const startOffset = daysBetween(checkIn, rangeStart);
                            const endOffset = daysBetween(checkOut, rangeStart);
                            const clampedStart = Math.max(0, startOffset);
                            const clampedEnd = Math.min(RANGE_DAYS, endOffset);
                            if (clampedEnd <= clampedStart) return null;

                            const left = clampedStart * COL_W + 2;
                            const width = (clampedEnd - clampedStart) * COL_W - 4;
                            const cfg = STATUS_CFG[b.status] ?? { bar: "bg-gray-500", text: "text-white" };
                            const crossesLeft = startOffset < 0;
                            const crossesRight = endOffset > RANGE_DAYS;

                            return (
                              <button
                                key={b.id}
                                onClick={() => setSelected(b)}
                                style={{ position: "absolute", left, width, top: 9, height: 32 }}
                                className={`${cfg.bar} ${cfg.text} flex items-center px-2 gap-1 overflow-hidden hover:opacity-90 hover:shadow-md transition-all ${Z_BAR} text-left
                                  ${crossesLeft ? "rounded-r-md" : "rounded-l-md"}
                                  ${crossesRight ? "rounded-l-md" : "rounded-r-md"}
                                  ${!crossesLeft && !crossesRight ? "rounded-md" : ""}
                                `}
                                title={`${b.guestName} · ${b.bookingNumber} · ${b.nights}N`}
                              >
                                {crossesLeft && <span className="opacity-70 text-xs leading-none">◀</span>}
                                <span className="text-xs font-medium truncate flex-1">{b.guestName.split(" ")[0]}</span>
                                {width > 70 && <span className="text-[10px] opacity-75 flex-shrink-0">{b.nights}N</span>}
                                {crossesRight && <span className="opacity-70 text-xs leading-none ml-auto">▶</span>}
                              </button>
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
        </div>
      )}

      {/* Booking detail panel */}
      {selected && (
        <>
          <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setSelected(null)} />
          <div className="fixed right-6 top-1/2 -translate-y-1/2 z-50 w-72 bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 bg-gray-50 border-b">
              <div>
                <div className="font-semibold text-gray-900">{selected.guestName}</div>
                <div className="text-xs text-gray-500 font-mono">{selected.bookingNumber}</div>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-5 space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-gray-400 mb-0.5">Check-in</div>
                  <div className="font-medium">{localDate(selected.checkIn).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-0.5">Check-out</div>
                  <div className="font-medium">{localDate(selected.checkOut).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-0.5">Duration</div>
                  <div className="font-medium">{selected.nights} night{selected.nights !== 1 ? "s" : ""}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-0.5">Guests</div>
                  <div className="font-medium">{selected.adults} adult{selected.adults !== 1 ? "s" : ""}</div>
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-0.5">Status</div>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_CFG[selected.status]?.bar ?? "bg-gray-400"} ${STATUS_CFG[selected.status]?.text ?? "text-white"}`}>
                  {STATUS_CFG[selected.status]?.label ?? selected.status}
                </span>
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-0.5">Amount</div>
                <div className="font-semibold text-gray-900">₹{selected.totalAmount.toLocaleString("en-IN")}</div>
              </div>
              <Link href={`/admin/bookings/${selected.id}`}
                onClick={() => setSelected(null)}
                className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 btn-admin">
                View Full Booking
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
