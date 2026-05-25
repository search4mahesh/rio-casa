"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { addDays, format, differenceInCalendarDays } from "date-fns";
import { Calendar, Users, User, Mail, Phone, CreditCard, QrCode, Check } from "lucide-react";

const guestSchema = z.object({
  guestName: z.string().min(2, "Name must be at least 2 characters"),
  guestEmail: z.string().email("Invalid email address"),
  guestPhone: z.string().min(10, "Enter a valid phone number"),
  specialRequests: z.string().optional(),
});

type GuestForm = z.infer<typeof guestSchema>;

const rooms = [
  { id: "room_1", name: "Deluxe Garden View", slug: "deluxe-garden-view", price: 4500, maxGuests: 2 },
  { id: "room_2", name: "Premium Valley Suite", slug: "premium-valley-suite", price: 7500, maxGuests: 3 },
  { id: "room_3", name: "Royal Hilltop Suite", slug: "royal-hilltop-suite", price: 12000, maxGuests: 4 },
  { id: "room_4", name: "Classic Double Room", slug: "classic-double-room", price: 3200, maxGuests: 2 },
];

const STEPS = ["dates", "room", "details", "payment"] as const;
type Step = (typeof STEPS)[number];

export default function BookingWizard({
  locale,
  preselectedSlug,
}: {
  locale: string;
  preselectedSlug?: string;
}) {
  const t = useTranslations("booking");
  const router = useRouter();
  const prefix = `/${locale}`;

  const today = new Date();
  const [checkIn, setCheckIn] = useState<string>(format(addDays(today, 1), "yyyy-MM-dd"));
  const [checkOut, setCheckOut] = useState<string>(format(addDays(today, 3), "yyyy-MM-dd"));
  const [guests, setGuests] = useState(2);
  const [selectedRoom, setSelectedRoom] = useState(
    preselectedSlug ? rooms.find((r) => r.slug === preselectedSlug) : undefined
  );
  const [step, setStep] = useState<Step>(preselectedSlug ? "dates" : "dates");
  const [paymentMethod, setPaymentMethod] = useState<"razorpay" | "upi">("razorpay");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const nights = differenceInCalendarDays(new Date(checkOut), new Date(checkIn));
  const totalAmount = selectedRoom ? selectedRoom.price * nights : 0;

  const {
    register,
    handleSubmit,
    formState: { errors },
    getValues,
  } = useForm<GuestForm>({ resolver: zodResolver(guestSchema) });

  const stepIndex = STEPS.indexOf(step);

  async function handlePayment(formData: GuestForm) {
    if (!selectedRoom) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/booking/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: selectedRoom.id,
          checkIn: new Date(checkIn).toISOString(),
          checkOut: new Date(checkOut).toISOString(),
          guests,
          ...formData,
        }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Booking failed");

      if (paymentMethod === "razorpay") {
        const options = {
          key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
          amount: data.data.amount * 100,
          currency: "INR",
          name: "Rio Casa",
          description: `${data.data.roomName} — ${data.data.nights} nights`,
          order_id: data.data.orderId,
          handler: async (response: {
            razorpay_order_id: string;
            razorpay_payment_id: string;
            razorpay_signature: string;
          }) => {
            const verifyRes = await fetch("/api/payment/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                bookingId: data.data.bookingId,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              }),
            });
            const verifyData = await verifyRes.json();
            if (verifyData.success) {
              router.push(`${prefix}/booking/confirmation?id=${verifyData.data.bookingId}`);
            }
          },
          prefill: {
            name: formData.guestName,
            email: formData.guestEmail,
            contact: formData.guestPhone,
          },
          theme: { color: "#4A6741" },
        };

        const rzp = new (window as unknown as { Razorpay: new (opts: typeof options) => { open(): void } }).Razorpay(options);
        rzp.open();
      } else {
        router.push(`${prefix}/booking/confirmation?id=${data.data.bookingId}&method=upi`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Step indicator */}
      <div className="flex items-center mb-8">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center flex-1">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-sans font-semibold transition-colors ${
                i < stepIndex
                  ? "bg-primary text-white"
                  : i === stepIndex
                  ? "bg-primary text-white"
                  : "bg-primary-100 text-primary-400"
              }`}
            >
              {i < stepIndex ? <Check size={14} /> : i + 1}
            </div>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1 ${i < stepIndex ? "bg-primary" : "bg-primary-100"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step 1 — Dates */}
      {step === "dates" && (
        <div className="bg-earth-white rounded-sm shadow-sm p-6">
          <h2 className="font-serif text-2xl mb-6 flex items-center gap-2">
            <Calendar size={20} className="text-primary" />
            Select Your Dates
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="font-sans text-sm text-earth-text/70 block mb-1">{t("checkIn")}</label>
              <input
                type="date"
                value={checkIn}
                min={format(addDays(today, 1), "yyyy-MM-dd")}
                onChange={(e) => setCheckIn(e.target.value)}
                className="w-full border border-primary-200 rounded-sm px-3 py-2.5 font-sans text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="font-sans text-sm text-earth-text/70 block mb-1">{t("checkOut")}</label>
              <input
                type="date"
                value={checkOut}
                min={format(addDays(new Date(checkIn), 1), "yyyy-MM-dd")}
                onChange={(e) => setCheckOut(e.target.value)}
                className="w-full border border-primary-200 rounded-sm px-3 py-2.5 font-sans text-sm focus:outline-none focus:border-primary"
              />
            </div>
          </div>
          <div className="mb-6">
            <label className="font-sans text-sm text-earth-text/70 block mb-1">{t("guests")}</label>
            <div className="flex items-center gap-3">
              <button onClick={() => setGuests(Math.max(1, guests - 1))} className="w-9 h-9 rounded-full border border-primary-200 flex items-center justify-center text-primary hover:bg-primary-50">−</button>
              <div className="flex items-center gap-2 font-sans text-earth-text"><Users size={16} className="text-primary" />{guests}</div>
              <button onClick={() => setGuests(Math.min(8, guests + 1))} className="w-9 h-9 rounded-full border border-primary-200 flex items-center justify-center text-primary hover:bg-primary-50">+</button>
            </div>
          </div>
          {nights > 0 && (
            <p className="font-sans text-sm text-primary-600 mb-6">
              {nights} {nights === 1 ? "night" : "nights"} selected
            </p>
          )}
          <button
            onClick={() => setStep("room")}
            disabled={nights <= 0}
            className="btn-primary w-full disabled:opacity-50"
          >
            Continue to Room Selection →
          </button>
        </div>
      )}

      {/* Step 2 — Room */}
      {step === "room" && (
        <div className="bg-earth-white rounded-sm shadow-sm p-6">
          <h2 className="font-serif text-2xl mb-6">{t("selectRoom")}</h2>
          <div className="space-y-3 mb-6">
            {rooms.filter((r) => r.maxGuests >= guests).map((room) => (
              <button
                key={room.id}
                onClick={() => setSelectedRoom(room)}
                className={`w-full text-left border rounded-sm p-4 transition-colors ${
                  selectedRoom?.id === room.id
                    ? "border-primary bg-primary-50"
                    : "border-primary-200 hover:border-primary-400"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-serif text-lg text-earth-text">{room.name}</p>
                    <p className="font-sans text-xs text-earth-text/50 mt-0.5">Up to {room.maxGuests} guests</p>
                  </div>
                  <div className="text-right">
                    <p className="font-serif text-xl text-primary">₹{room.price.toLocaleString("en-IN")}</p>
                    <p className="font-sans text-xs text-earth-text/50">{t("perNight")}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
          {selectedRoom && (
            <div className="bg-primary-50 rounded-sm px-4 py-3 mb-4 font-sans text-sm text-primary">
              {nights} nights × ₹{selectedRoom.price.toLocaleString("en-IN")} ={" "}
              <strong>₹{totalAmount.toLocaleString("en-IN")}</strong>
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={() => setStep("dates")} className="btn-outline flex-1">← Back</button>
            <button
              onClick={() => setStep("details")}
              disabled={!selectedRoom}
              className="btn-primary flex-1 disabled:opacity-50"
            >
              Continue →
            </button>
          </div>
        </div>
      )}

      {/* Step 3 — Guest details */}
      {step === "details" && (
        <div className="bg-earth-white rounded-sm shadow-sm p-6">
          <h2 className="font-serif text-2xl mb-6 flex items-center gap-2">
            <User size={20} className="text-primary" />
            {t("guestDetails")}
          </h2>
          <div className="space-y-4 mb-6">
            <div>
              <label className="font-sans text-sm text-earth-text/70 block mb-1">{t("name")} *</label>
              <input {...register("guestName")} placeholder="Rahul Sharma" className="w-full border border-primary-200 rounded-sm px-3 py-2.5 font-sans text-sm focus:outline-none focus:border-primary" />
              {errors.guestName && <p className="text-red-500 text-xs mt-1">{errors.guestName.message}</p>}
            </div>
            <div>
              <label className="font-sans text-sm text-earth-text/70 block mb-1">{t("email")} *</label>
              <input {...register("guestEmail")} type="email" placeholder="rahul@email.com" className="w-full border border-primary-200 rounded-sm px-3 py-2.5 font-sans text-sm focus:outline-none focus:border-primary" />
              {errors.guestEmail && <p className="text-red-500 text-xs mt-1">{errors.guestEmail.message}</p>}
            </div>
            <div>
              <label className="font-sans text-sm text-earth-text/70 block mb-1">{t("phone")} *</label>
              <input {...register("guestPhone")} type="tel" placeholder="98765 43210" className="w-full border border-primary-200 rounded-sm px-3 py-2.5 font-sans text-sm focus:outline-none focus:border-primary" />
              {errors.guestPhone && <p className="text-red-500 text-xs mt-1">{errors.guestPhone.message}</p>}
            </div>
            <div>
              <label className="font-sans text-sm text-earth-text/70 block mb-1">{t("specialRequests")}</label>
              <textarea {...register("specialRequests")} rows={3} placeholder="Early check-in, anniversary decoration, dietary requirements..." className="w-full border border-primary-200 rounded-sm px-3 py-2.5 font-sans text-sm focus:outline-none focus:border-primary resize-none" />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep("room")} className="btn-outline flex-1">← Back</button>
            <button onClick={() => setStep("payment")} className="btn-primary flex-1">Continue →</button>
          </div>
        </div>
      )}

      {/* Step 4 — Payment */}
      {step === "payment" && (
        <form onSubmit={handleSubmit(handlePayment)}>
          <div className="bg-earth-white rounded-sm shadow-sm p-6">
            <h2 className="font-serif text-2xl mb-6 flex items-center gap-2">
              <CreditCard size={20} className="text-primary" />
              {t("payment")}
            </h2>

            {/* Summary */}
            <div className="bg-primary-50 rounded-sm p-4 mb-6 space-y-1.5 font-sans text-sm">
              <div className="flex justify-between"><span className="text-earth-text/60">Room</span><span className="font-semibold">{selectedRoom?.name}</span></div>
              <div className="flex justify-between"><span className="text-earth-text/60">Check-in</span><span>{format(new Date(checkIn), "dd MMM yyyy")}</span></div>
              <div className="flex justify-between"><span className="text-earth-text/60">Check-out</span><span>{format(new Date(checkOut), "dd MMM yyyy")}</span></div>
              <div className="flex justify-between"><span className="text-earth-text/60">Guests</span><span>{guests}</span></div>
              <div className="border-t border-primary-200 pt-2 mt-2 flex justify-between font-semibold text-primary text-base">
                <span>{t("totalAmount")}</span>
                <span>₹{totalAmount.toLocaleString("en-IN")}</span>
              </div>
            </div>

            {/* Payment method */}
            <div className="space-y-3 mb-6">
              <button
                type="button"
                onClick={() => setPaymentMethod("razorpay")}
                className={`w-full text-left border rounded-sm p-4 flex items-center gap-3 transition-colors ${paymentMethod === "razorpay" ? "border-primary bg-primary-50" : "border-primary-200"}`}
              >
                <CreditCard size={18} className="text-primary shrink-0" />
                <div>
                  <p className="font-sans font-medium text-sm">{t("payWithRazorpay")}</p>
                  <p className="font-sans text-xs text-earth-text/50">Visa, Mastercard, RuPay, UPI, Net Banking</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod("upi")}
                className={`w-full text-left border rounded-sm p-4 flex items-center gap-3 transition-colors ${paymentMethod === "upi" ? "border-primary bg-primary-50" : "border-primary-200"}`}
              >
                <QrCode size={18} className="text-primary shrink-0" />
                <div>
                  <p className="font-sans font-medium text-sm">{t("payWithUPI")}</p>
                  <p className="font-sans text-xs text-earth-text/50">Scan QR with any UPI app (GPay, PhonePe, Paytm)</p>
                </div>
              </button>
            </div>

            {error && <p className="text-red-500 font-sans text-sm mb-4">{error}</p>}

            <div className="flex gap-3">
              <button type="button" onClick={() => setStep("details")} className="btn-outline flex-1">← Back</button>
              <button type="submit" disabled={loading} className="btn-primary flex-1 disabled:opacity-50">
                {loading ? "Processing..." : t("confirm")}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
