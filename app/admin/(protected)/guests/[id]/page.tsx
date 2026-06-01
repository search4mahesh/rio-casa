"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type Booking = {
  id: string; bookingNumber: string;
  checkIn: string; checkOut: string; nights: number;
  totalAmount: number; status: string; paymentStatus: string;
  room: { name: string; roomNumber?: string | null; roomType: string };
};

type Invoice = {
  id: string; invoiceNumber: string; totalAmount: string;
  invoiceDate: string; status: string;
};

type Guest = {
  id: string;
  firstName: string; lastName: string;
  email?: string | null; phone: string; altPhone?: string | null;
  address?: string | null; city?: string | null; state?: string | null;
  country: string; pincode?: string | null;
  idProofType?: string | null; idProofNumber?: string | null;
  nationality: string; gstin?: string | null; companyName?: string | null;
  notes?: string | null;
  totalStays: number; totalRevenue: string;
  createdAt: string;
  bookings: Booking[];
  invoices: Invoice[];
};

const STATUS_COLOR: Record<string, string> = {
  confirmed: "bg-blue-100 text-blue-700",
  checked_in: "bg-green-100 text-green-700",
  checked_out: "bg-gray-100 text-gray-600",
  cancelled: "bg-red-100 text-red-600",
  no_show: "bg-orange-100 text-orange-700",
};

function fmtCurrency(n: number | string) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n));
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function Field({ label, value, mono = false }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs text-gray-500 mb-0.5">{label}</div>
      <div className={`text-sm font-medium text-gray-800 ${mono ? "font-mono" : ""}`}>{value || "—"}</div>
    </div>
  );
}

export default function GuestProfilePage({ params }: { params: { id: string } }) {
  const { id } = params;

  const [guest, setGuest] = useState<Guest | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [notes, setNotes] = useState("");
  const [toast, setToast] = useState("");
  const [form, setForm] = useState<Partial<Guest>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/guests/${id}`);
    const data = await res.json();
    if (data.success) {
      setGuest(data.guest);
      setNotes(data.guest.notes ?? "");
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(""), 3500); }

  function startEdit() {
    if (!guest) return;
    setForm({
      firstName: guest.firstName, lastName: guest.lastName,
      email: guest.email, phone: guest.phone, altPhone: guest.altPhone,
      address: guest.address, city: guest.city, state: guest.state,
      country: guest.country, pincode: guest.pincode,
      idProofType: guest.idProofType, idProofNumber: guest.idProofNumber,
      nationality: guest.nationality, gstin: guest.gstin, companyName: guest.companyName,
    });
    setEditing(true);
  }

  async function saveEdit() {
    setSaving(true);
    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(form)) {
      payload[k] = v === "" ? null : v;
    }
    const res = await fetch(`/api/admin/guests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.success) { showToast("Guest updated"); setEditing(false); await load(); }
    else showToast(data.error ?? "Save failed");
    setSaving(false);
  }

  async function saveNotes() {
    setSavingNotes(true);
    const res = await fetch(`/api/admin/guests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: notes || null }),
    });
    const data = await res.json();
    if (data.success) showToast("Notes saved");
    else showToast(data.error ?? "Save failed");
    setSavingNotes(false);
  }

  const f = (field: keyof Guest) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [field]: e.target.value }));

  if (loading) return <div className="p-6 text-center text-gray-400 py-20">Loading guest…</div>;
  if (!guest) return (
    <div className="p-6">
      <Link href="/admin/guests" className="text-sm text-[#4A6741] hover:underline">← Back to Guests</Link>
      <div className="text-center py-20 text-gray-400">Guest not found</div>
    </div>
  );

  return (
    <div className="p-6 max-w-6xl">
      {/* Breadcrumb */}
      <Link href="/admin/guests" className="text-sm text-[#4A6741] hover:underline inline-flex items-center gap-1 mb-4">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Guests
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-[#4A6741] flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
            {guest.firstName.charAt(0)}{guest.lastName.charAt(0)}
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{guest.firstName} {guest.lastName}</h1>
            <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-gray-500">
              <span>{guest.phone}</span>
              {guest.email && <><span>·</span><span>{guest.email}</span></>}
              {guest.gstin && (
                <><span>·</span>
                <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-xs font-medium">B2B · GSTIN</span></>
              )}
            </div>
          </div>
        </div>
        {!editing && (
          <button onClick={startEdit}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Edit
          </button>
        )}
      </div>

      {/* Lifetime stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border-2 border-[#4A6741]/30 rounded-xl p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Total Stays</div>
          <div className="text-2xl font-bold text-[#4A6741] mt-1">{guest.totalStays}</div>
        </div>
        <div className="bg-white border-2 border-amber-200 rounded-xl p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Lifetime Value</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{fmtCurrency(guest.totalRevenue)}</div>
        </div>
        <div className="bg-white border-2 border-blue-200 rounded-xl p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Bookings</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{guest.bookings.length}</div>
        </div>
        <div className="bg-white border-2 border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Guest Since</div>
          <div className="text-lg font-bold text-gray-900 mt-1">{fmtDate(guest.createdAt)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Contact + ID + Notes */}
        <div className="space-y-6">
          {/* Contact panel */}
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Contact & Address</h2>
            {editing ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">First Name *</label>
                    <input value={form.firstName ?? ""} onChange={f("firstName")} required
                      className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4A6741]" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Last Name *</label>
                    <input value={form.lastName ?? ""} onChange={f("lastName")} required
                      className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4A6741]" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Phone *</label>
                  <input value={form.phone ?? ""} onChange={f("phone")} required
                    className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4A6741]" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Alt Phone</label>
                  <input value={form.altPhone ?? ""} onChange={f("altPhone")}
                    className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4A6741]" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Email</label>
                  <input type="email" value={form.email ?? ""} onChange={f("email")}
                    className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4A6741]" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Address</label>
                  <input value={form.address ?? ""} onChange={f("address")}
                    className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4A6741]" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">City</label>
                    <input value={form.city ?? ""} onChange={f("city")}
                      className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4A6741]" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">State</label>
                    <input value={form.state ?? ""} onChange={f("state")}
                      className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4A6741]" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Pincode</label>
                    <input value={form.pincode ?? ""} onChange={f("pincode")}
                      className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4A6741]" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Country</label>
                    <input value={form.country ?? ""} onChange={f("country")}
                      className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4A6741]" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">GSTIN</label>
                    <input value={form.gstin ?? ""} onChange={f("gstin")}
                      className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4A6741]" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Company Name</label>
                    <input value={form.companyName ?? ""} onChange={f("companyName")}
                      className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4A6741]" />
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <button onClick={() => setEditing(false)} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
                  <button onClick={saveEdit} disabled={saving}
                    className="flex-1 py-2 bg-[#4A6741] hover:bg-[#3d5636] disabled:opacity-60 text-white text-sm font-medium rounded-lg">
                    {saving ? "Saving…" : "Save Changes"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Phone" value={guest.phone} />
                  <Field label="Alt Phone" value={guest.altPhone} />
                </div>
                <Field label="Email" value={guest.email} />
                <Field label="Address" value={guest.address} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="City" value={guest.city} />
                  <Field label="State" value={guest.state} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Pincode" value={guest.pincode} />
                  <Field label="Country" value={guest.country} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="ID Proof" value={guest.idProofType ? `${guest.idProofType} · ${guest.idProofNumber ?? ""}` : null} />
                  <Field label="Nationality" value={guest.nationality} />
                </div>
                {(guest.gstin || guest.companyName) && (
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100">
                    <Field label="GSTIN" value={guest.gstin} mono />
                    <Field label="Company" value={guest.companyName} />
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Notes panel */}
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700">Internal Notes</h2>
              {notes !== (guest.notes ?? "") && (
                <button onClick={saveNotes} disabled={savingNotes}
                  className="px-2.5 py-1 text-xs bg-[#4A6741] hover:bg-[#3d5636] disabled:opacity-60 text-white rounded-lg transition-colors">
                  {savingNotes ? "…" : "Save"}
                </button>
              )}
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => { if (notes !== (guest.notes ?? "")) saveNotes(); }}
              rows={5}
              placeholder='e.g. "Prefers quiet room. Vegetarian. Birthday in June."'
              className="w-full text-sm px-3 py-2 border border-gray-200 bg-yellow-50/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4A6741] resize-none" />
          </section>
        </div>

        {/* Right column: Bookings + Invoices */}
        <div className="lg:col-span-2 space-y-6">
          {/* Booking history */}
          <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">Booking History</h2>
              <span className="text-xs text-gray-400">{guest.bookings.length} booking{guest.bookings.length !== 1 ? "s" : ""}</span>
            </div>
            {guest.bookings.length === 0 ? (
              <div className="text-center py-10 text-sm text-gray-400">No bookings yet</div>
            ) : (
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-2.5 font-medium text-gray-500">Booking #</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-500">Room</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-500">Stay</th>
                    <th className="text-right px-4 py-2.5 font-medium text-gray-500">Amount</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {guest.bookings.map((b) => (
                    <tr key={b.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5">
                        <Link href={`/admin/bookings/${b.id}`} className="font-mono text-xs text-[#4A6741] hover:underline">{b.bookingNumber}</Link>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-gray-800">{b.room.roomNumber ? `#${b.room.roomNumber}` : b.room.name}</div>
                        <div className="text-xs text-gray-400 capitalize">{b.room.roomType}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="text-xs text-gray-600">{fmtDate(b.checkIn)} → {fmtDate(b.checkOut)}</div>
                        <div className="text-xs text-gray-400">{b.nights} night{b.nights !== 1 ? "s" : ""}</div>
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium text-gray-800">{fmtCurrency(b.totalAmount)}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[b.status] ?? "bg-gray-100 text-gray-600"}`}>
                          {b.status.replace("_", " ")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* Invoices */}
          {guest.invoices.length > 0 && (
            <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-700">Invoices</h2>
              </div>
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-2.5 font-medium text-gray-500">Invoice #</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-500">Date</th>
                    <th className="text-right px-4 py-2.5 font-medium text-gray-500">Amount</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-500">Status</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {guest.invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-mono text-xs text-[#4A6741]">{inv.invoiceNumber}</td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">{fmtDate(inv.invoiceDate)}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-gray-800">{fmtCurrency(inv.totalAmount)}</td>
                      <td className="px-4 py-2.5">
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs capitalize">{inv.status}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Link href={`/admin/invoices/${inv.id}/print`} target="_blank"
                          className="text-xs text-[#4A6741] hover:underline">View</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 bg-gray-900 text-white text-sm px-4 py-3 rounded-lg shadow-lg z-50">{toast}</div>
      )}
    </div>
  );
}
