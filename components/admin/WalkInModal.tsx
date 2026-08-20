"use client";

import { useEffect, useState } from "react";
import { propertyDayString, dateOnly, addDays, toDayString } from "@/lib/dates";
import { Field } from "@/components/ui/Field";

export function WalkInModal({ onClose }: { onClose: () => void }) {
  const [rooms, setRooms] = useState<{ id: string; name: string; roomNumber?: string; pricePerNight: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Today *at the property*, not on whatever machine renders this.
  // `toISOString()` is UTC, so before 05:30 IST the front desk opened this
  // modal to yesterday's date already filled in.
  const todayAtProperty = propertyDayString();
  const [form, setForm] = useState({
    roomId: "",
    checkIn: todayAtProperty,
    checkOut: toDayString(addDays(dateOnly(todayAtProperty), 1)),
    guestName: "",
    guestPhone: "",
    guestEmail: "",
    adults: 1,
    children: 0,
    paymentMethod: "cash",
    amountPaid: 0,
    // Blank means "charge the tariff". A number here is the desk negotiating,
    // and replaces the whole nightly rate — see quoteStay in booking-service.
    nightlyRate: "",
    specialRequests: "",
  });

  useEffect(() => {
    fetch("/api/admin/rooms/status").then((r) => r.json()).then((d) => {
      if (d.success) setRooms(d.data);
    });
  }, []);

  // Only to show the desk what the standard rate is while they type over it.
  const selectedRoom = rooms.find((r) => r.id === form.roomId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { nightlyRate, ...rest } = form;
      const negotiated = nightlyRate.trim() === "" ? null : Number(nightlyRate);
      if (negotiated !== null && (!Number.isFinite(negotiated) || negotiated <= 0)) {
        setError("Negotiated rate must be a positive amount, or blank for the standard tariff");
        return;
      }

      const res = await fetch("/api/admin/bookings/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...rest,
          adults: Number(form.adults),
          children: Number(form.children),
          amountPaid: Number(form.amountPaid),
          // Omitted entirely when blank — the route treats an absent
          // `nightlyRate` as "price it off the rate plan".
          ...(negotiated !== null ? { nightlyRate: negotiated } : {}),
        }),
      });
      // An unhandled route error answers with an empty body, and a bare
      // res.json() would reject with "Unexpected end of JSON input".
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        onClose();
      } else {
        setError(data?.error ?? "Failed to create booking");
      }
    } catch (err) {
      // Previously try/finally with no catch: a rejected fetch left the modal
      // sitting there having apparently done nothing at all.
      console.error("[walk-in] booking request failed", err);
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  const field = (label: string, render: (id: string) => React.ReactNode) => (
    <Field label={label}>{render}</Field>
  );

  const inp = (props: React.InputHTMLAttributes<HTMLInputElement> & { name: keyof typeof form }) => (
    <input
      {...props}
      value={String(form[props.name])}
      onChange={(e) => setForm((f) => ({ ...f, [props.name]: e.target.value }))}
      className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
    />
  );

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <h2 className="font-semibold text-gray-900">Walk-in Booking</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <form onSubmit={handleSubmit} className="flex-1 overflow-auto p-6 space-y-4">
            {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}
            {field("Room *", (id) => (
              <select
                id={id}
                required
                value={form.roomId}
                onChange={(e) => setForm((f) => ({ ...f, roomId: e.target.value }))}
                className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white"
              >
                <option value="">Select a room</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.roomNumber ? `#${r.roomNumber} — ` : ""}{r.name} (₹{r.pricePerNight}/night)
                  </option>
                ))}
              </select>
            ))}
            <div className="grid grid-cols-2 gap-3">
              {field("Check-in *", (id) => inp({ id, name: "checkIn", type: "date", required: true }))}
              {field("Check-out *", (id) => inp({ id, name: "checkOut", type: "date", required: true }))}
            </div>
            {field("Guest Name *", (id) => inp({ id, name: "guestName", type: "text", required: true, placeholder: "Full name" }))}
            <div className="grid grid-cols-2 gap-3">
              {field("Phone *", (id) => inp({ id, name: "guestPhone", type: "tel", required: true, placeholder: "9876543210" }))}
              {field("Email", (id) => inp({ id, name: "guestEmail", type: "email", placeholder: "optional" }))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {field("Adults", (id) => inp({ id, name: "adults", type: "number", min: 1, max: 10 }))}
              {field("Children", (id) => inp({ id, name: "children", type: "number", min: 0, max: 10 }))}
            </div>
            {/* The negotiated rate. Blank is the normal case — the room prices
                off its rate plan exactly as the website would. A number here
                replaces the whole tariff and is recorded in the audit log. */}
            <Field
              label="Negotiated Rate (₹ / night)"
              hint={
                form.nightlyRate.trim()
                  ? "Replaces the tariff entirely — no weekend markup, no extra bed on top. Logged against your name."
                  : "Leave blank to charge the standard tariff, including any weekend markup."
              }
            >
              {(id) => (
                <input
                  id={id}
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={form.nightlyRate}
                  onChange={(e) => setForm((f) => ({ ...f, nightlyRate: e.target.value }))}
                  placeholder={selectedRoom ? `Standard: ₹${selectedRoom.pricePerNight}` : "Leave blank for standard tariff"}
                  className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              )}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              {field("Payment Method", (id) => (
                <select
                  id={id}
                  value={form.paymentMethod}
                  onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value }))}
                  className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="complimentary">Complimentary</option>
                </select>
              ))}
              {field("Amount Paid (₹)", (id) => inp({ id, name: "amountPaid", type: "number", min: 0 }))}
            </div>
            {field("Special Requests", (id) => (
              <textarea
                id={id}
                rows={2}
                value={form.specialRequests}
                onChange={(e) => setForm((f) => ({ ...f, specialRequests: e.target.value }))}
                className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                placeholder="Any special requests…"
              />
            ))}
          </form>
          <div className="px-6 py-4 border-t flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit as unknown as React.MouseEventHandler}
              disabled={loading}
              className="flex-1 py-2.5 btn-admin"
            >
              {loading ? "Creating…" : "Create Booking"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
