"use client";

import { useEffect, useState, useCallback } from "react";
import { useToast, Toast } from "@/components/ui/Toast";

type Task = {
  id: string;
  taskType: string;
  status: string;
  assignedTo?: string;
  notes?: string;
  maintenanceFlag: boolean;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  room: { name: string; roomNumber?: string; floor?: number };
};

type Room = { id: string; name: string; roomNumber?: string };

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending:     { label: "Pending",     color: "bg-yellow-100 text-yellow-700" },
  in_progress: { label: "In Progress", color: "bg-blue-100 text-blue-700" },
  completed:   { label: "Completed",   color: "bg-green-100 text-green-700" },
  cancelled:   { label: "Cancelled",   color: "bg-gray-100 text-gray-500" },
};

const TASK_LABEL: Record<string, string> = {
  cleaning:       "Cleaning",
  inspection:     "Inspection",
  maintenance:    "Maintenance",
  turndown:       "Turndown",
  laundry:        "Laundry",
  checkout_clean: "Checkout Clean",
};

export default function HousekeepingPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceCount, setMaintenanceCount] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const { toast, showToast } = useToast();
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (maintenanceMode) {
      params.set("maintenance", "true");
    } else if (statusFilter !== "all") {
      params.set("status", statusFilter);
    }
    const [taskRes, roomRes, countRes] = await Promise.all([
      fetch(`/api/admin/housekeeping?${params}`),
      fetch("/api/admin/rooms/status"),
      fetch("/api/admin/housekeeping?maintenanceCount=true"),
    ]);
    const taskData = await taskRes.json();
    const roomData = await roomRes.json();
    const countData = await countRes.json();
    if (taskData.success) setTasks(taskData.data);
    if (roomData.success) setRooms(roomData.data);
    if (countData.success) setMaintenanceCount(countData.data);
    setLoading(false);
  }, [statusFilter, maintenanceMode]);

  useEffect(() => { load(); }, [load]);


  async function updateStatus(id: string, status: string) {
    setActionLoading(id + status);
    const res = await fetch(`/api/admin/housekeeping/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (data.success) { showToast("Updated"); load(); }
    else showToast(data.error ?? "Error");
    setActionLoading(null);
  }

  async function resolveMaintenanceFlag(id: string) {
    setActionLoading(id + "resolve");
    const res = await fetch(`/api/admin/housekeeping/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed", maintenanceFlag: false }),
    });
    const data = await res.json();
    if (data.success) { showToast("Maintenance issue resolved"); load(); }
    else showToast(data.error ?? "Error");
    setActionLoading(null);
  }

  const grouped: Record<string, Task[]> = {};
  for (const t of tasks) {
    const key = t.status;
    (grouped[key] ??= []).push(t);
  }

  const statusOrder = ["pending", "in_progress", "completed", "cancelled"];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Housekeeping</h1>
          <p className="text-sm text-gray-500 mt-0.5">{tasks.length} task{tasks.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Maintenance Alerts toggle */}
          <button
            onClick={() => { setMaintenanceMode((m) => !m); setStatusFilter("all"); }}
            className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
              maintenanceMode
                ? "bg-red-600 border-red-600 text-white"
                : "border-gray-300 text-gray-600 hover:bg-gray-50"
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Maintenance Alerts
            {maintenanceCount > 0 && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none ${
                maintenanceMode ? "bg-white text-red-600" : "bg-red-500 text-white"
              }`}>
                {maintenanceCount > 9 ? "9+" : maintenanceCount}
              </span>
            )}
          </button>

          {!maintenanceMode && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white"
            >
              <option value="all">All Status</option>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          )}

          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 btn-admin"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Task
          </button>
        </div>
      </div>

      {/* Maintenance mode banner */}
      {maintenanceMode && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl mb-6">
          <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <span className="text-sm font-semibold text-red-800">Maintenance Alerts</span>
            <span className="text-sm text-red-600 ml-2">
              {tasks.length === 0 ? "No open maintenance issues" : `${tasks.length} open issue${tasks.length !== 1 ? "s" : ""} requiring attention`}
            </span>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading…</div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">{maintenanceMode ? "✓" : "✓"}</div>
          <div className="text-gray-500">
            {maintenanceMode ? "No open maintenance issues" : "No tasks found"}
          </div>
        </div>
      ) : maintenanceMode ? (
        /* ── Maintenance mode: flat table with Resolve button ── */
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-red-50">
                <th className="text-left px-4 py-2.5 font-medium text-gray-500">Room</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-500">Task</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-500">Status</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-500">Assigned To</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-500">Notes</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-500">Flagged</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tasks.map((task) => (
                <tr key={task.id} className="hover:bg-red-50/30">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">
                      {task.room.roomNumber ? `#${task.room.roomNumber}` : task.room.name}
                    </div>
                    {task.room.floor != null && (
                      <div className="text-xs text-gray-400">Floor {task.room.floor}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                      <span>{TASK_LABEL[task.taskType] ?? task.taskType}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CONFIG[task.status]?.color ?? "bg-gray-100 text-gray-600"}`}>
                      {STATUS_CONFIG[task.status]?.label ?? task.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{task.assignedTo || "—"}</td>
                  <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">{task.notes || "—"}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {new Date(task.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => resolveMaintenanceFlag(task.id)}
                      disabled={actionLoading === task.id + "resolve"}
                      className="px-3 py-1.5 text-xs font-medium bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                    >
                      {actionLoading === task.id + "resolve" ? "…" : "Resolve"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* ── Normal mode: grouped by status ── */
        <div className="space-y-6">
          {statusOrder.filter((s) => grouped[s]?.length).map((status) => (
            <div key={status}>
              <div className="flex items-center gap-2 mb-3">
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_CONFIG[status]?.color ?? "bg-gray-100 text-gray-600"}`}>
                  {STATUS_CONFIG[status]?.label ?? status}
                </span>
                <span className="text-xs text-gray-400">{grouped[status].length}</span>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-4 py-2.5 font-medium text-gray-500">Room</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-500">Task</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-500">Assigned To</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-500">Notes</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-500">Created</th>
                      <th className="px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {grouped[status].map((task) => (
                      <tr key={task.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">
                            {task.room.roomNumber ? `#${task.room.roomNumber}` : task.room.name}
                          </div>
                          {task.room.floor != null && (
                            <div className="text-xs text-gray-400">Floor {task.room.floor}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="capitalize">{TASK_LABEL[task.taskType] ?? task.taskType}</span>
                          {task.maintenanceFlag && (
                            <span className="ml-2 px-1.5 py-0.5 bg-red-100 text-red-600 text-xs rounded">Maintenance</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500">{task.assignedTo || "—"}</td>
                        <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">{task.notes || "—"}</td>
                        <td className="px-4 py-3 text-xs text-gray-400">
                          {new Date(task.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                          <div>{new Date(task.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {task.status === "pending" && (
                              <button
                                onClick={() => updateStatus(task.id, "in_progress")}
                                disabled={actionLoading === task.id + "in_progress"}
                                className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                              >
                                Start
                              </button>
                            )}
                            {task.status === "in_progress" && (
                              <button
                                onClick={() => updateStatus(task.id, "completed")}
                                disabled={actionLoading === task.id + "completed"}
                                className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                              >
                                Done
                              </button>
                            )}
                            {!["completed", "cancelled"].includes(task.status) && (
                              <button
                                onClick={() => updateStatus(task.id, "cancelled")}
                                disabled={actionLoading === task.id + "cancelled"}
                                className="px-2 py-1 text-xs border border-gray-300 text-gray-500 rounded hover:bg-gray-50 disabled:opacity-50"
                              >
                                Cancel
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      <Toast message={toast} />

      {showAdd && <AddTaskModal rooms={rooms} onClose={() => { setShowAdd(false); load(); }} />}
    </div>
  );
}

function AddTaskModal({ rooms, onClose }: { rooms: Room[]; onClose: () => void }) {
  const [form, setForm] = useState({ roomId: "", taskType: "cleaning", assignedTo: "", notes: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/admin/housekeeping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (data.success) onClose();
    else setError(data.error ?? "Failed");
    setLoading(false);
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <h2 className="font-semibold text-gray-900">Add Task</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Room *</label>
              <select required value={form.roomId} onChange={(e) => setForm((f) => ({ ...f, roomId: e.target.value }))}
                className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white">
                <option value="">Select room</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>{r.roomNumber ? `#${r.roomNumber} — ` : ""}{r.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Task Type *</label>
              <select value={form.taskType} onChange={(e) => setForm((f) => ({ ...f, taskType: e.target.value }))}
                className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white">
                <option value="cleaning">Cleaning</option>
                <option value="inspection">Inspection</option>
                <option value="maintenance">Maintenance</option>
                <option value="turndown">Turndown</option>
                <option value="laundry">Laundry</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Assigned To</label>
              <input type="text" value={form.assignedTo} onChange={(e) => setForm((f) => ({ ...f, assignedTo: e.target.value }))}
                placeholder="Staff name (optional)"
                className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Any specific instructions…"
                className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose}
                className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={loading}
                className="flex-1 py-2.5 btn-admin">
                {loading ? "Adding…" : "Add Task"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
