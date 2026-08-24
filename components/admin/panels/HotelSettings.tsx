"use client";

import { useEffect, useState, useId } from "react";
import { ROLE_LABEL } from "@/lib/labels";
import { useToast, Toast } from "@/components/ui/Toast";

type StaffMember = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  isActive: boolean;
  lastLogin?: string;
  createdAt: string;
};

const ROLE_COLOR: Record<string, string> = {
  owner:        "bg-purple-100 text-purple-700",
  manager:      "bg-blue-100 text-blue-700",
  frontdesk:    "bg-green-100 text-green-700",
  housekeeping: "bg-yellow-100 text-yellow-700",
};

export default function HotelSettingsPanel({ gstin }: { gstin: string }) {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const { toast, showToast } = useToast();
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string>("");

  async function loadStaff() {
    const res = await fetch("/api/admin/staff");
    const data = await res.json();
    if (data.success) setStaff(data.data);
    setLoading(false);
  }

  useEffect(() => {
    loadStaff();
    fetch("/api/admin/auth/me")
      .then((r) => r.json())
      .then((d) => { if (d.success) setMyRole(d.data.role); })
      .catch(() => {});
  }, []);


  async function toggleActive(member: StaffMember) {
    setTogglingId(member.id);
    const res = await fetch(`/api/admin/staff/${member.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !member.isActive }),
    });
    const data = await res.json();
    if (data.success) { showToast(`${member.name} ${!member.isActive ? "activated" : "deactivated"}`); loadStaff(); }
    else showToast(data.error ?? "Error");
    setTogglingId(null);
  }

  const hotelInfo = [
    { label: "Hotel Name", value: "Rio Casa Resort" },
    { label: "Location", value: "Mahabaleshwar, Satara District, Maharashtra" },
    // `HOTEL_GSTIN` has no `NEXT_PUBLIC_` prefix — it's read server-side, same
    // as lib/invoice-service.ts reads it, and passed down as a prop. This
    // component is a client component, so reading `process.env.HOTEL_GSTIN`
    // here directly would always be `undefined` (B-29).
    { label: "GSTIN", value: gstin },
    { label: "WhatsApp", value: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "—" },
  ];

  return (
    <div className="p-6 max-w-4xl">
      {/* Hotel info */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="font-semibold text-gray-900 mb-4">Hotel Information</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {hotelInfo.map((item) => (
            <div key={item.label}>
              <dt className="text-xs text-gray-500 mb-0.5">{item.label}</dt>
              <dd className="text-sm font-medium text-gray-900">{item.value}</dd>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-4">To update hotel info, edit the environment variables in your deployment settings.</p>
      </section>

      {/* Staff */}
      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="font-semibold text-gray-900">Staff Members</h2>
            <p className="text-xs text-gray-500 mt-0.5">{staff.length} member{staff.length !== 1 ? "s" : ""}</p>
          </div>
          {myRole === "owner" && (
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-4 py-2 btn-admin"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Staff
            </button>
          )}
        </div>

        {loading ? (
          <div className="py-12 text-center text-gray-400">Loading…</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-6 py-3 font-medium text-gray-600">Name</th>
                <th className="text-left px-6 py-3 font-medium text-gray-600">Role</th>
                <th className="text-left px-6 py-3 font-medium text-gray-600">Phone</th>
                <th className="text-left px-6 py-3 font-medium text-gray-600">Last Login</th>
                <th className="text-left px-6 py-3 font-medium text-gray-600">Status</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {staff.map((m) => (
                <tr key={m.id} className={`hover:bg-gray-50 ${!m.isActive ? "opacity-50" : ""}`}>
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{m.name}</div>
                    <div className="text-xs text-gray-500">{m.email}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${ROLE_COLOR[m.role] ?? "bg-gray-100 text-gray-600"}`}>
                      {ROLE_LABEL[m.role] ?? m.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-500">{m.phone || "—"}</td>
                  <td className="px-6 py-4 text-xs text-gray-400">
                    {m.lastLogin
                      ? new Date(m.lastLogin).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })
                      : "Never"}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${m.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {m.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {myRole === "owner" && (
                      <button
                        onClick={() => toggleActive(m)}
                        disabled={togglingId === m.id}
                        className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                      >
                        {togglingId === m.id ? "…" : m.isActive ? "Deactivate" : "Activate"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <Toast message={toast} />

      {showAdd && <AddStaffModal onClose={() => { setShowAdd(false); loadStaff(); }} />}
    </div>
  );
}

function AddStaffModal({ onClose }: { onClose: () => void }) {
  const fieldId = useId();
  const [form, setForm] = useState({ name: "", email: "", phone: "", role: "frontdesk", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/admin/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (data.success) onClose();
    else setError(data.error ?? "Failed to create staff");
    setLoading(false);
  }

  const inp = (label: string, name: keyof typeof form, props?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <div>
      <label htmlFor={`${fieldId}-field`} className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input id={`${fieldId}-field`}
        {...props}
        value={form[name]}
        onChange={(e) => setForm((f) => ({ ...f, [name]: e.target.value }))}
        className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
      />
    </div>
  );

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <h2 className="font-semibold text-gray-900">Add Staff Member</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

            {inp("Full Name *", "name", { required: true, placeholder: "e.g. Priya Sharma" })}
            {inp("Email *", "email", { required: true, type: "email", placeholder: "priya@riocasa.in" })}
            {inp("Phone", "phone", { type: "tel", placeholder: "9876543210" })}

            <div>
              <label htmlFor={`${fieldId}-role`} className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
              <select id={`${fieldId}-role`} required value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white">
                <option value="manager">Manager</option>
                <option value="frontdesk">Front Desk</option>
                <option value="housekeeping">Housekeeping</option>
              </select>
            </div>

            {inp("Temporary Password *", "password", { required: true, type: "password", minLength: 6, placeholder: "Min. 6 characters" })}

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose}
                className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={loading}
                className="flex-1 py-2.5 btn-admin">
                {loading ? "Creating…" : "Create Staff"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
