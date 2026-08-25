"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiJson } from "@/lib/api-client";
import { ErrorState } from "@/components/ui/ErrorState";

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

const GRID_STATUS_COLOR: Record<string, { bar: string; text: string }> = {
  confirmed:   { bar: "bg-blue-500",   text: "text-white" },
  checked_in:  { bar: "bg-primary",  text: "text-white" },
  checked_out: { bar: "bg-gray-300",   text: "text-gray-600" },
};

const COL_W   = 56;  // px per day
const ROW_H   = 52;  // px per room row
const LABEL_W = 148; // px for room name column
const DAYS    = 14;

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

export default function OccupancyGridPanel() {
  const [rooms, setRooms] = useState<GridRoom[]>([]);
  const [bookings, setBookings] = useState<GridBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: DAYS }, (_, i) => addDays(today, i));

  useEffect(() => {
    apiJson("/api/admin/occupancy").then((d) => {
      if (d.success) { setRooms(d.data.rooms); setBookings(d.data.bookings); }
      else setLoadError(d.error);
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
  if (loadError) return <ErrorState message={loadError} className="py-16" />;

  const totalWidth = LABEL_W + DAYS * COL_W;

  return (
    <div className="p-6">
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
                    className={`flex-shrink-0 flex flex-col items-center justify-center py-2 border-r border-gray-200 ${isToday ? "bg-primary/10" : ""}`}
                  >
                    <span className={`text-xs font-medium ${isToday ? "text-primary" : isWeekend ? "text-amber-600" : "text-gray-400"}`}>
                      {day.toLocaleDateString("en-IN", { weekday: "short" })}
                    </span>
                    <span className={`text-sm font-bold leading-tight ${isToday ? "text-primary" : isWeekend ? "text-amber-700" : "text-gray-700"}`}>
                      {day.getDate()}
                    </span>
                    {isToday && <span className="text-[9px] text-primary font-semibold uppercase tracking-wide">Today</span>}
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
                    <div style={{ width: COL_W, marginLeft: 0, height: "100%" }} className="bg-primary/5 inline-block" />
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
                            className={`border-r border-gray-100 ${i === 0 ? "bg-primary/5" : ""}`}
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
            { color: "bg-primary", label: "Checked In" },
            { color: "bg-blue-500",  label: "Confirmed" },
            { color: "bg-gray-300",  label: "Checked Out" },
            { color: "bg-primary/5 border border-primary/20", label: "Today" },
            { color: "bg-amber-50 border border-amber-200",       label: "Weekend" },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className={`w-3.5 h-3.5 rounded ${color}`} />
              <span className="text-xs text-gray-500">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
