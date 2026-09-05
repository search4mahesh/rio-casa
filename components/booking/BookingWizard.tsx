"use client";

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { addDays, format, differenceInCalendarDays } from "date-fns";
import { Calendar, Users, User, CreditCard, QrCode, Check, BedDouble } from "lucide-react";
import Image from "next/image";
import { Field } from "@/components/ui/Field";
import { isDayString } from "@/lib/dates";
import { marketingFor } from "@/lib/room-marketing";
import { PROPERTY, telHref } from "@/lib/property";
import {
  toCategories,
  allocate,
  suggestAllocation,
  selectionFromAllocation,
  formatSelection,
  largestSingleRoom,
  totalCapacity,
  type RoomSelection,
} from "@/lib/room-capacity";

const guestSchema = z.object({
  guestName: z.string().min(2, "Name must be at least 2 characters"),
  guestEmail: z.string().email("Invalid email address"),
  guestPhone: z.string().min(10, "Enter a valid phone number"),
  specialRequests: z.string().optional(),
});

type GuestForm = z.infer<typeof guestSchema>;

interface AvailableRoom {
  id: string;
  name: string;
  slug: string;
  pricePerNight: number;
  maxGuests: number;
  roomType: string;
  extraBed: boolean;
  extraBedRate: number;
  amenities: string[];
}

/**
 * The largest party the counter will go to.
 *
 * Deliberately not the property's capacity, even though the counter now sits on
 * the room step where that number is known: stopping the guest at it would
 * replace "We can sleep 9 guests on these dates, and there are 10 in your
 * party — call us" with a button that silently refuses to go further. A party
 * too large to house should be told so, and told who to ring.
 *
 * The old cap of 8 was arbitrary in the other direction: with five rooms and a
 * rollaway in each, seventeen guests genuinely fit.
 */
const MAX_PARTY = 20;

/** Where this browser remembers the stay between page loads. Session-scoped,
 *  so it does not outlive the tab — see the restore effect for what is and is
 *  not kept here. */
const STAY_STORAGE_KEY = "riocasa.booking.stay";

const STEPS = ["dates", "room", "details", "payment"] as const;
type Step = (typeof STEPS)[number];

/** Each step’s name in `messages/en.json`, spelled out rather than derived:
 *  a key built by string surgery is one typo away from rendering its own path
 *  to the guest, and next-intl does not fall back. */
const STEP_LABEL_KEY = {
  dates: "stepDates",
  room: "stepRoom",
  details: "stepDetails",
  payment: "stepPayment",
} as const;

/**
 * What the stay costs, priced by the server.
 *
 * This screen used to compute `pricePerNight × nights` and label it "Total
 * Amount". The server prices through `quoteStay` → `applyGst`, which adds GST
 * and any weekend markup on the rate plan, so the guest approved one number and
 * Razorpay charged another. The only number allowed to appear as a total is one
 * that came back from /api/booking/quote.
 */
interface Quote {
  nights: number;
  subtotal: number;
  cgstAmount: number;
  sgstAmount: number;
  taxAmount: number;
  totalAmount: number;
  /** Rooms booked, and how many carry a rollaway. Both decided by the server. */
  totalRooms?: number;
  extraBeds?: number;
  lines?: Array<{
    roomType: string;
    roomName: string;
    rooms: number;
    extraBeds: number;
    /** Rooms alone and beds alone, split by the server — see the quote route. */
    roomsSubtotal: number;
    bedsSubtotal: number;
    subtotal: number;
    totalAmount: number;
  }>;
}

/**
 * A promo code's effect on the stay, previewed without spending a redemption
 * — see /api/booking/promo/preview. The actual claim only happens inside
 * `createBooking`, so this can go stale between "Apply" and "Confirm
 * Booking"; the server refuses the whole booking rather than silently
 * charging more than this total if that happens.
 */
interface PromoPreview {
  valid: boolean;
  reason?: string;
  discountAmount?: number;
  cgstAmount?: number;
  sgstAmount?: number;
  taxAmount?: number;
  totalAmount?: number;
}

/** The wizard's label typography — `Field` defaults to the admin style. */
const LABEL_CLASS = "font-sans text-sm text-earth-text/70 block mb-1";

export default function BookingWizard({
  locale,
  preselectedSlug,
  initialCheckIn,
  initialCheckOut,
}: {
  locale: string;
  preselectedSlug?: string;
  /** Dates the guest already chose on /rooms, so they are not asked twice. */
  initialCheckIn?: string;
  initialCheckOut?: string;
}) {
  const t = useTranslations("booking");
  // "perNight" lives in the rooms namespace, not booking.
  const tRooms = useTranslations("rooms");
  const router = useRouter();
  const prefix = `/${locale}`;

  const today = new Date();
  const defaultIn = format(addDays(today, 1), "yyyy-MM-dd");
  const defaultOut = format(addDays(today, 3), "yyyy-MM-dd");

  /**
   * A date handed over in the URL, or null.
   *
   * Validated rather than trusted: these arrive from the query string, where
   * `?checkIn=2026-02-30` is as easy to type as a real day. `isDayString`
   * rejects a date that does not exist — feeding one to a `<input type="date">`
   * blanks the control, and `differenceInCalendarDays` on it returns NaN, which
   * disables Continue with nothing on screen to explain why.
   */
  const handedOver = (raw: string | undefined): string | null =>
    raw && isDayString(raw) ? raw : null;

  const givenIn = handedOver(initialCheckIn);
  const givenOut = handedOver(initialCheckOut);
  // Both or neither: half a range is worse than the default pair, because the
  // one that survived silently pairs with a default two days from it.
  const usable = givenIn && givenOut && givenOut > givenIn;

  const [checkIn, setCheckIn] = useState<string>(usable ? givenIn! : defaultIn);
  const [checkOut, setCheckOut] = useState<string>(usable ? givenOut! : defaultOut);
  const [guests, setGuests] = useState(2);
  const [availableRooms, setAvailableRooms] = useState<AvailableRoom[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [roomsError, setRoomsError] = useState("");
  // How many rooms of each type the party is taking. Extra beds are *not* in
  // here — the server derives them from the headcount, so a browser cannot book
  // five people into four beds. See `allocate` in lib/room-capacity.ts.
  const [selection, setSelection] = useState<RoomSelection>({});
  // True while the guest is still on the combination we picked for them. Turned
  // off by the first stepper press, so the "we chose this" note does not keep
  // claiming credit for a selection the guest has since changed.
  const [selectionIsSuggested, setSelectionIsSuggested] = useState(false);
  const [step, setStep] = useState<Step>("dates");
  const [paymentMethod, setPaymentMethod] = useState<"razorpay" | "upi">("razorpay");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  const guestsLabelId = useId();
  const roomCountLabelId = useId();
  const [promoCode, setPromoCode] = useState("");
  const [promoPreview, setPromoPreview] = useState<PromoPreview | null>(null);
  const [promoChecking, setPromoChecking] = useState(false);
  // The code actually behind `promoPreview` — only this is sent at checkout,
  // so editing the input after "Apply" can't submit an unvalidated string.
  const [appliedPromoCode, setAppliedPromoCode] = useState<string | null>(null);

  const nights = differenceInCalendarDays(new Date(checkOut), new Date(checkIn));

  /**
   * Bring back the stay this browser was last looking at.
   *
   * A refresh, a stray back-swipe, or closing the Razorpay modal and landing
   * on the page again used to drop the guest on step 1 with the default
   * "tomorrow, two nights" — four steps of input gone, and no sign that
   * anything had been lost. Restoring the dates and the party size puts them
   * one press of Continue from where they were.
   *
   * Deliberately narrow. The room selection is *not* restored: availability
   * moves, and re-offering a room that has since been taken is worse than
   * asking again. Neither are the guest’s name, email or phone — this is a
   * page people open on shared and hotel-lobby machines, and remembering
   * somebody’s contact details there is not a convenience.
   *
   * Restored in an effect rather than in the `useState` initialiser because
   * `sessionStorage` does not exist during the server render, and reading it
   * where the two must agree is a hydration mismatch.
   */
  const [restoredStay, setRestoredStay] = useState(false);
  const [storageChecked, setStorageChecked] = useState(false);

  useEffect(() => {
    try {
      // The URL wins. A guest who just clicked "Book This Room" for a stay in
      // October means October, not what they were browsing an hour ago.
      if (usable) return;
      const raw = sessionStorage.getItem(STAY_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { checkIn?: string; checkOut?: string; guests?: number };
      if (!saved.checkIn || !saved.checkOut) return;
      if (!isDayString(saved.checkIn) || !isDayString(saved.checkOut)) return;
      // Same validation the query string gets, for the same reason: a stay
      // that has since fallen into the past, or one saved backwards by an
      // older build, is worse than the default pair.
      if (saved.checkOut <= saved.checkIn) return;
      if (saved.checkIn < format(today, "yyyy-MM-dd")) return;

      setCheckIn(saved.checkIn);
      setCheckOut(saved.checkOut);
      if (Number.isInteger(saved.guests) && saved.guests! >= 1 && saved.guests! <= MAX_PARTY) {
        setGuests(saved.guests!);
      }
      setRestoredStay(true);
    } catch {
      // Private mode, a disabled store, a value some other tab corrupted.
      // None of it is worth a broken wizard — the defaults are already right.
    } finally {
      setStorageChecked(true);
    }
    // Once, on mount. Re-running it would fight the guest for the inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Gated on the read having happened, so the first render cannot write the
  // defaults over the stay it is about to restore.
  useEffect(() => {
    if (!storageChecked) return;
    try {
      sessionStorage.setItem(STAY_STORAGE_KEY, JSON.stringify({ checkIn, checkOut, guests }));
    } catch {
      // Full or unavailable. Losing the memory is not losing the booking.
    }
  }, [storageChecked, checkIn, checkOut, guests]);

  /** Throw the remembered stay away and go back to the defaults. */
  function startAgain() {
    try {
      sessionStorage.removeItem(STAY_STORAGE_KEY);
    } catch {
      /* nothing to clear */
    }
    setCheckIn(defaultIn);
    setCheckOut(defaultOut);
    setGuests(2);
    setRestoredStay(false);
  }

  // The categories a guest chooses between, folded out of the free-room list.
  // Same function the server uses, so the capacity and price shown here are the
  // ones the booking is actually made at.
  const categories = toCategories(availableRooms);
  const plan = allocate(selection, categories, guests);
  const selectedRooms = plan.totalRooms;
  // The party is housed only when the chosen rooms sleep everyone. Continue
  // stays disabled until then — this is the check that used to be missing
  // entirely, because one room was all a guest could pick.
  const partyHoused = selectedRooms > 0 && plan.capacity >= guests;
  const propertyCapacity = totalCapacity(categories);
  const biggestRoom = largestSingleRoom(categories);

  // Serialised for the API. A stable string is also what the effects below
  // depend on — a fresh object every render would re-fetch forever.
  const selectionParam = formatSelection(selection);

  // Re-price whenever the rooms, the party or the dates change. Clearing the
  // old quote first matters: a stale total from a previous selection is worse
  // than no total, because it still reads as authoritative.
  useEffect(() => {
    // Only once the chosen rooms actually sleep the party. Mid-edit — a guest
    // has removed the family room and added the first of two standards — the
    // selection is legitimately short, and the server rightly refuses to price
    // it. Asking anyway spends a round trip to be told so and logs a 400 the
    // guest did nothing wrong to earn.
    if (!selectionParam || !partyHoused || nights <= 0) {
      setQuote(null);
      return;
    }

    let cancelled = false;
    setQuote(null);
    setQuoteLoading(true);

    const params = new URLSearchParams({
      rooms: selectionParam,
      guests: String(guests),
      checkIn,
      checkOut,
    });
    fetch(`/api/booking/quote?${params}`)
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok && data?.success) setQuote(data.data as Quote);
        else setQuote(null);
      })
      .catch(() => {
        if (!cancelled) setQuote(null);
      })
      .finally(() => {
        if (!cancelled) setQuoteLoading(false);
      });

    // A slow response for a room the guest has already moved on from must not
    // land on top of the current one.
    return () => {
      cancelled = true;
    };
  }, [selectionParam, partyHoused, guests, checkIn, checkOut, nights]);

  // A promo's discount depends on the subtotal and nights, both of which just
  // changed. A stale "applied" preview would show a total that no longer
  // matches what a fresh claim would compute — same reasoning as clearing the
  // quote above.
  useEffect(() => {
    setPromoPreview(null);
    setAppliedPromoCode(null);
  }, [selectionParam, guests, checkIn, checkOut]);

  async function applyPromo() {
    const code = promoCode.trim();
    if (!code || !selectionParam) return;
    setPromoChecking(true);
    setPromoPreview(null);
    setAppliedPromoCode(null);
    try {
      const params = new URLSearchParams({
        code,
        rooms: selectionParam,
        guests: String(guests),
        checkIn,
        checkOut,
      });
      const res = await fetch(`/api/booking/promo/preview?${params}`);
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        const preview = data.data as PromoPreview;
        setPromoPreview(preview);
        if (preview.valid) setAppliedPromoCode(code);
      } else {
        setPromoPreview({ valid: false, reason: data?.error ?? "Could not check that code" });
      }
    } catch {
      setPromoPreview({ valid: false, reason: "Could not reach the server — try again" });
    } finally {
      setPromoChecking(false);
    }
  }

  // What the guest actually sees as "the total" — the promo's numbers once a
  // code has been applied, the plain quote otherwise. Never a client-side
  // computation: both come straight from the server, same as the quote always
  // has (see the Quote interface's note on B-02).
  const displayTotals =
    appliedPromoCode && promoPreview?.valid
      ? {
          subtotal: quote?.subtotal ?? 0,
          taxAmount: promoPreview.taxAmount!,
          totalAmount: promoPreview.totalAmount!,
          discountAmount: promoPreview.discountAmount!,
        }
      : quote
      ? { subtotal: quote.subtotal, taxAmount: quote.taxAmount, totalAmount: quote.totalAmount, discountAmount: 0 }
      : null;

  async function fetchAvailableRooms() {
    setRoomsLoading(true);
    setRoomsError("");
    setSelection({});
    setSelectionIsSuggested(false);
    try {
      const params = new URLSearchParams({ checkIn, checkOut, guests: String(guests) });
      const res = await fetch(`/api/booking/availability?${params}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to load rooms");

      // Every free room, not one per type: a party of five may need two of the
      // same kind, so the count per category is part of the answer now.
      const fetched: AvailableRoom[] = data.data;
      setAvailableRooms(fetched);

      const cats = toCategories(fetched);

      // Start the guest on the cheapest combination that sleeps the party, so
      // the common case is one press of Continue. They can still change it.
      const suggested = suggestAllocation(cats, guests);
      if (suggested) {
        setSelection(selectionFromAllocation(suggested));
        setSelectionIsSuggested(true);
      }

      // Arriving from a room page: honour that choice over the suggestion, then
      // top it up with whatever else the party needs.
      if (preselectedSlug) {
        const match = fetched.find((r) => r.slug.startsWith(preselectedSlug));
        if (match) {
          const pinned = { [match.roomType]: 1 };
          const topUp = suggestAllocation(
            cats.map((c) =>
              c.roomType === match.roomType ? { ...c, count: c.count - 1 } : c
            ),
            Math.max(0, guests - (match.maxGuests + (match.extraBed ? 1 : 0)))
          );
          if (topUp) {
            for (const line of topUp.lines) {
              pinned[line.roomType] = (pinned[line.roomType] ?? 0) + line.rooms;
            }
          }
          setSelection(pinned);
          setSelectionIsSuggested(false); // the guest's own choice, not ours
        }
      }
    } catch (err) {
      setRoomsError(err instanceof Error ? err.message : "Could not load rooms");
    } finally {
      setRoomsLoading(false);
    }
  }

  /**
   * Change the party size from the room step.
   *
   * The counter sits beside the cards rather than on the date step, because
   * every line it governs is here: "Sleeps 2 (+1 with an extra bed, ₹1,000)",
   * the combination we suggest, the running "sleeps 5 of 6" tally and the
   * price. A guest who sets it a step earlier has to remember what they typed
   * to make sense of any of them.
   *
   * Availability is deliberately *not* refetched. Party size stopped being a
   * filter on the room list with B-57 — a party of five may want two standards
   * rather than the family room, so the list is every free room and the party
   * is composed from it. Only the suggestion depends on the headcount.
   *
   * Re-suggesting is guarded on `selectionIsSuggested`: while the guest is
   * still on the combination we picked, the counter re-picks it, but the first
   * time they change a room themselves the selection becomes theirs and a
   * later counter press must not throw it away.
   */
  function setPartySize(next: number) {
    const clamped = Math.max(1, Math.min(MAX_PARTY, next));
    setGuests(clamped);
    if (!selectionIsSuggested) return;
    const suggested = suggestAllocation(categories, clamped);
    setSelection(suggested ? selectionFromAllocation(suggested) : {});
  }

  /** Add or remove one room of a type, clamped to what is free. */
  function setRoomCount(roomType: string, next: number) {
    setSelectionIsSuggested(false);
    const cat = categories.find((c) => c.roomType === roomType);
    const clamped = Math.max(0, Math.min(next, cat?.count ?? 0));
    setSelection((prev) => {
      const updated = { ...prev };
      if (clamped === 0) delete updated[roomType];
      else updated[roomType] = clamped;
      return updated;
    });
  }

  const {
    register,
    handleSubmit,
    trigger,
    formState: { errors },
  } = useForm<GuestForm>({ resolver: zodResolver(guestSchema) });

  // Step 3 must validate before advancing. The error messages are rendered
  // inside the step-3 markup, so letting invalid details through to step 4
  // unmounts them — "Confirm Booking" then silently refuses with nothing shown.
  async function continueFromDetails() {
    if (await trigger()) setStep("payment");
  }

  const stepIndex = STEPS.indexOf(step);

  async function handlePayment(formData: GuestForm) {
    if (!partyHoused) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/booking/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Room *types* and counts. Which physical rooms, and which of them
          // get a rollaway, is the server's decision — see resolveSelection.
          rooms: selection,
          checkIn: new Date(checkIn).toISOString(),
          checkOut: new Date(checkOut).toISOString(),
          guests,
          // Only a code this session actually previewed as valid — never the
          // raw text box, which the guest could have edited after "Apply" (or
          // never applied at all).
          ...(appliedPromoCode ? { promoCode: appliedPromoCode } : {}),
          ...formData,
        }),
      });

      // An unhandled server error answers with an empty body, and res.json()
      // would then surface a raw JS exception ("Unexpected end of JSON input")
      // to the guest.
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        // The promo previewed as valid moments ago but could not actually be
        // claimed (exhausted, expired) — surface that plainly rather than a
        // generic failure, and drop it so the total show on retry is honest.
        if (data?.error && /promo code/i.test(data.error)) {
          setPromoPreview(null);
          setAppliedPromoCode(null);
        }
        throw new Error(data?.error || "Something went wrong. Please try again, or contact us to book.");
      }

      if (paymentMethod === "razorpay") {
        const options = {
          key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
          // Paise, and Razorpay wants an integer. `11800.5 * 100` is
          // 1180050.0000000002 in floating point — the server already rounds
          // before creating the order, so round here too rather than sending
          // a fractional paisa that disagrees with it.
          amount: Math.round(data.data.amount * 100),
          currency: "INR",
          name: PROPERTY.name,
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
            const verifyData = await verifyRes.json().catch(() => null);
            if (verifyRes.ok && verifyData?.success) {
              router.push(`${prefix}/booking/confirmation?id=${verifyData.data.bookingId}`);
              return;
            }
            // The guest has already paid at this point — never leave them on a
            // dead screen. Surface the booking number so support can trace it.
            setLoading(false);
            setError(
              `Your payment went through, but we could not confirm the booking automatically. ` +
                `Please contact us quoting reference ${data.data.bookingNumber} — do not pay again.`
            );
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
      {/* Step indicator.

          Four unlabelled circles used to be all of this: the guest could not
          see what the four steps were, and from Details the only way back to
          the dates was to press Back twice. A completed step is a button now.
          Backwards only — every forward move is gated on something the guest
          may not have done yet (a housed party, valid details), and those
          gates live on the steps’ own Continue buttons. */}
      <nav aria-label={t("title")} className="mb-8">
        <ol className="flex items-start">
          {STEPS.map((s, i) => {
            const label = t(STEP_LABEL_KEY[s]);
            const done = i < stepIndex;
            const current = i === stepIndex;
            return (
              <li
                key={s}
                aria-current={current ? "step" : undefined}
                className={`flex items-start ${i < STEPS.length - 1 ? "flex-1" : ""}`}
              >
                <div className="flex flex-col items-center gap-1.5 w-16 shrink-0">
                  {done ? (
                    <button
                      type="button"
                      onClick={() => setStep(s)}
                      aria-label={t("stepGoBack", { step: label })}
                      className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary-600 transition-colors"
                    >
                      <Check size={14} />
                    </button>
                  ) : (
                    <span
                      aria-hidden="true"
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-sans font-semibold ${
                        current ? "bg-primary text-white" : "bg-primary-100 text-primary-400"
                      }`}
                    >
                      {i + 1}
                    </span>
                  )}
                  <span
                    className={`font-sans text-xs text-center leading-tight ${
                      current ? "text-primary font-medium" : "text-earth-text/60"
                    }`}
                  >
                    {label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    aria-hidden="true"
                    className={`flex-1 h-0.5 mt-4 ${done ? "bg-primary" : "bg-primary-100"}`}
                  />
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Step 1 — Dates */}
      {step === "dates" && (
        <div className="bg-earth-white rounded-sm shadow-sm p-6">
          <h2 className="font-serif text-2xl mb-6 flex items-center gap-2">
            <Calendar size={20} className="text-primary" />
            Select Your Dates
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <Field label={t("checkIn")} labelClassName={LABEL_CLASS}>
              {(id) => (
                <input
                  id={id}
                  type="date"
                  value={checkIn}
                  min={format(addDays(today, 1), "yyyy-MM-dd")}
                  onChange={(e) => setCheckIn(e.target.value)}
                  className="input-resort w-full"
                />
              )}
            </Field>
            <Field label={t("checkOut")} labelClassName={LABEL_CLASS}>
              {(id) => (
                <input
                  id={id}
                  type="date"
                  value={checkOut}
                  min={format(addDays(new Date(checkIn), 1), "yyyy-MM-dd")}
                  onChange={(e) => setCheckOut(e.target.value)}
                  className="input-resort w-full"
                />
              )}
            </Field>
          </div>
          {/* The party size lives on the room step, next to the capacity it
              governs — see the note on `setPartySize`. */}
          {nights > 0 && (
            <p className={`font-sans text-sm text-primary-600 ${restoredStay ? "mb-2" : "mb-6"}`}>
              {nights} {nights === 1 ? "night" : "nights"} selected
            </p>
          )}

          {/* Say so when the dates were remembered rather than chosen here. A
              form that quietly fills itself in reads as a bug the first time,
              and there has to be a way out of it. */}
          {restoredStay && (
            <p className="font-sans text-xs text-earth-text/70 mb-6 flex flex-wrap items-center gap-x-3">
              <span>{t("restored")}</span>
              <button type="button" onClick={startAgain} className="text-primary underline">
                {t("restoredClear")}
              </button>
            </p>
          )}
          <button
            onClick={async () => { await fetchAvailableRooms(); setStep("room"); }}
            disabled={nights <= 0}
            className="btn-primary w-full disabled:opacity-50"
          >
            Continue to Room Selection →
          </button>
        </div>
      )}

      {/* Step 2 — Rooms */}
      {step === "room" && (
        <div className="bg-earth-white rounded-sm shadow-sm p-6">
          <h2 className="font-serif text-2xl mb-2">{t("selectRoom")}</h2>
          <p className="font-sans text-sm text-earth-text/70 mb-4">
            {nights} {nights === 1 ? "night" : "nights"}
            {guests > biggestRoom && biggestRoom > 0 && (
              <>
                {" — "}
                <span className="text-accent">
                  our largest room sleeps {biggestRoom}, so this party needs more than one
                </span>
              </>
            )}
          </p>

          {/* The headcount, next to the rooms it has to fit into. A pair of
              buttons is a group, not a labelled control: a `<label>` here names
              nothing, so this is a `<span id>` the container points at with
              `aria-labelledby`. See CLAUDE.md. */}
          <div className="flex items-center justify-between gap-4 border border-primary-200 rounded-sm px-4 py-3 mb-6">
            <span id={guestsLabelId} className="font-sans text-sm text-earth-text/70">
              {t("guests")}
            </span>
            <div className="flex items-center gap-3" role="group" aria-labelledby={guestsLabelId}>
              <button type="button" aria-label={t("guestsDecrease")} onClick={() => setPartySize(guests - 1)} disabled={guests <= 1} className="stepper-button">−</button>
              <div className="flex items-center gap-2 font-sans text-earth-text"><Users size={16} className="text-primary" />{guests}</div>
              <button type="button" aria-label={t("guestsIncrease")} onClick={() => setPartySize(guests + 1)} disabled={guests >= MAX_PARTY} className="stepper-button">+</button>
            </div>
          </div>

          {roomsLoading && (
            <p role="status" className="font-sans text-sm text-earth-text/70 text-center py-8">
              Checking availability…
            </p>
          )}
          {roomsError && (
            <p role="alert" className="font-sans text-sm text-red-500 mb-4">{roomsError}</p>
          )}

          {/* The property genuinely has nothing free. Distinct from "nothing
              sleeps five on its own", which used to render this same line and
              tell a party the resort was full while every room stood empty
              (B-57). */}
          {!roomsLoading && categories.length === 0 && !roomsError && (
            <p role="status" className="font-sans text-sm text-earth-text/70 text-center py-8">
              No rooms available for the selected dates.
            </p>
          )}

          {/* A party bigger than the whole property cannot be housed by
              choosing differently, so say so instead of leaving them to add
              rooms that will never add up. */}
          {!roomsLoading && categories.length > 0 && guests > propertyCapacity && (
            <div className="border border-accent/40 bg-accent/5 rounded-sm p-4 mb-6 font-sans text-sm">
              <p className="text-earth-text">
                We can sleep {propertyCapacity} guests on these dates, and there are {guests} in
                your party.
              </p>
              <p className="text-earth-text/70 mt-1">
                Call us on{" "}
                <a href={telHref()} className="text-primary underline">{PROPERTY.phone}</a>{" "}
                and we will see what we can arrange.
              </p>
            </div>
          )}

          {/* Why a card is already selected. Without this the guest cannot tell
              whether they picked it, we did, or it is simply the only option —
              and a suggestion nobody knows is a suggestion reads as a decision
              already taken. */}
          {!roomsLoading && selectionIsSuggested && partyHoused && (
            <p className="font-sans text-sm text-primary bg-primary-50 rounded-sm px-4 py-2.5 mb-4">
              We have picked the best-value rooms for {guests} guests. Change
              anything below.
            </p>
          )}

          <div className="space-y-3 mb-6">
            {categories.map((cat) => {
              const taken = selection[cat.roomType] ?? 0;
              const line = plan.lines.find((l) => l.roomType === cat.roomType);
              const beds = line?.extraBeds ?? 0;
              return (
                <div
                  key={cat.roomType}
                  className={`border rounded-sm p-4 transition-colors ${
                    taken > 0 ? "border-primary bg-primary-50" : "border-primary-200"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    {/* The same curated hero /rooms uses, so a guest recognises
                        the room they were just looking at. `marketingFor` falls
                        back for an unknown type, and the DB `images` array is
                        deliberately not used here — coverage is patchy, and a
                        card with a photo on one room type and a blank on the
                        next is worse than none. */}
                    <div className="relative w-24 h-20 sm:w-32 sm:h-24 shrink-0 rounded-sm overflow-hidden bg-primary-50">
                      <Image
                        src={marketingFor(cat.roomType).heroImage}
                        alt={marketingFor(cat.roomType).heroAlt}
                        fill
                        className="object-cover"
                        sizes="128px"
                      />
                    </div>
                    <div className="flex-1 min-w-0 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-serif text-lg text-earth-text">{cat.name}</p>
                        <p className="font-sans text-xs text-earth-text/70 mt-0.5">
                          Sleeps {cat.maxGuests}
                          {cat.extraBed && ` (+1 with an extra bed, ₹${cat.extraBedRate.toLocaleString("en-IN")})`}
                        </p>
                        {/* Scarcity only when it is real. "1 room left" on every
                            card reads as a sales tactic and stops being read. */}
                        {cat.count <= 2 && (
                          <p className="font-sans text-xs text-accent mt-0.5">
                            Only {cat.count} left for these dates
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-serif text-xl text-primary">
                          ₹{cat.pricePerNight.toLocaleString("en-IN")}
                        </p>
                        <p className="font-sans text-xs text-earth-text/70">{tRooms("perNight")}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-primary-200/60">
                    {/* A row of buttons is a group, not a labelled control —
                        see the note on the guest counter and CLAUDE.md. */}
                    {/* The control's own label stays "Rooms" on every card —
                        it names the −/+ pair, and a label that changes meaning
                        card to card is announced differently by a screen reader
                        each time. The bed is a separate statement. */}
                    <span className="font-sans text-xs text-earth-text/70 flex items-center gap-2">
                      <span id={`${roomCountLabelId}-${cat.roomType}`}>Rooms</span>
                      {beds > 0 && (
                        <span className="text-primary bg-primary-50 border border-primary-200 rounded-full px-2 py-0.5">
                          +{beds} extra {beds === 1 ? "bed" : "beds"}
                        </span>
                      )}
                    </span>
                    <div
                      className="flex items-center gap-3"
                      role="group"
                      aria-labelledby={`${roomCountLabelId}-${cat.roomType}`}
                    >
                      <button
                        type="button"
                        aria-label={`One fewer ${cat.name}`}
                        onClick={() => setRoomCount(cat.roomType, taken - 1)}
                        disabled={taken === 0}
                        className="stepper-button"
                      >
                        −
                      </button>
                      <span className="font-sans text-earth-text w-4 text-center">{taken}</span>
                      <button
                        type="button"
                        aria-label={`One more ${cat.name}`}
                        onClick={() => setRoomCount(cat.roomType, taken + 1)}
                        disabled={taken >= cat.count}
                        className="stepper-button"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* The tally, the total and the action, pinned to the bottom of the
              viewport on a phone.
              
              In flow, these sit below four room cards — so tapping "+" on the
              first one put the "sleeps 3 of 5" answer about 500px off-screen,
              and the guest had to scroll to find out whether the thing they
              just did was enough. `sticky` rather than `fixed` so it releases
              at the end of the card instead of sitting over the footer for the
              rest of the page. Full width via negative margins that undo the
              card's padding, then put it back inside. */}
          <div className="sticky bottom-0 -mx-6 -mb-6 px-6 pt-3 pb-6 bg-earth-white border-t border-primary-200/60 sm:static sm:mx-0 sm:mb-0 sm:px-0 sm:pt-0 sm:pb-0 sm:bg-transparent sm:border-0">
          {/* Where the party stands. Shown whenever anything is selected, so a
              guest who removes a room sees the shortfall rather than a
              Continue button that has quietly stopped working. */}
          {selectedRooms > 0 && (
            <div
              className={`rounded-sm px-4 py-3 mb-4 font-sans text-sm ${
                partyHoused ? "bg-primary-50 text-primary" : "border border-accent/40 bg-accent/5 text-earth-text"
              }`}
            >
              {/* Announced on every change. This is the answer to the −/+
                  press the guest just made — whether the party now fits —
                  and without a live region the only way to learn it was to
                  go looking for a line that had silently rewritten itself.

                  Scoped to the tally and the shortfall, deliberately: the
                  itemised quote below is inside this same box, and putting
                  the region around all of it would read every line of the
                  bill out again on each press. */}
              <div aria-live="polite">
                <p className="flex items-center gap-2">
                  <BedDouble size={15} className="shrink-0" aria-hidden="true" />
                  {selectedRooms} {selectedRooms === 1 ? "room" : "rooms"}
                  {plan.totalExtraBeds > 0 && (
                    <> · {plan.totalExtraBeds} extra {plan.totalExtraBeds === 1 ? "bed" : "beds"}</>
                  )}
                  {" · "}
                  sleeps {plan.capacity} of {guests}
                </p>

                {!partyHoused && (
                  <p className="mt-1 text-earth-text/70">
                    Add {guests - plan.capacity} more{" "}
                    {guests - plan.capacity === 1 ? "space" : "spaces"} to continue.
                  </p>
                )}
              </div>

              {partyHoused && (
                <div className="mt-2">
                  {quoteLoading && <p role="status">{t("priceLoading")}</p>}
                  {!quoteLoading && !quote && <p role="status">{t("priceUnavailable")}</p>}

                  {/* Itemised so the total is checkable against the per-night
                      prices above it. Every figure here is the server's — see
                      the note in the quote route about why the browser must not
                      multiply the nightly rate to bridge the gap. */}
                  {!quoteLoading && quote?.lines && (
                    <div className="space-y-1 pt-2 border-t border-primary/15">
                      {quote.lines.map((line) => (
                        <div key={line.roomType}>
                          <div className="flex justify-between gap-3">
                            <span>
                              {line.rooms > 1 ? `${line.rooms} × ` : ""}{line.roomName}
                              <span className="text-primary/60">
                                {" "}· {nights} {nights === 1 ? "night" : "nights"}
                              </span>
                            </span>
                            <span>₹{line.roomsSubtotal.toLocaleString("en-IN")}</span>
                          </div>
                          {line.extraBeds > 0 && (
                            <div className="flex justify-between gap-3 text-primary/70">
                              <span>
                                {line.extraBeds > 1 ? `${line.extraBeds} × ` : ""}extra bed
                              </span>
                              <span>₹{line.bedsSubtotal.toLocaleString("en-IN")}</span>
                            </div>
                          )}
                        </div>
                      ))}

                      {displayTotals && displayTotals.discountAmount > 0 && (
                        <div className="flex justify-between gap-3 text-accent">
                          <span>Promo discount</span>
                          <span>−₹{displayTotals.discountAmount.toLocaleString("en-IN")}</span>
                        </div>
                      )}

                      <div className="flex justify-between gap-3 text-primary/70">
                        <span>GST</span>
                        <span>
                          ₹{(displayTotals?.taxAmount ?? quote.taxAmount).toLocaleString("en-IN")}
                        </span>
                      </div>

                      <div className="flex justify-between gap-3 pt-1.5 mt-1 border-t border-primary/15 font-semibold">
                        <span>Total</span>
                        <span>
                          ₹{(displayTotals?.totalAmount ?? quote.totalAmount).toLocaleString("en-IN")}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep("dates")} className="btn-outline flex-1">← Back</button>
            <button
              onClick={() => setStep("details")}
              disabled={!partyHoused}
              className="btn-primary flex-1 disabled:opacity-50"
            >
              Continue →
            </button>
          </div>
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
            <Field label={<>{t("name")} *</>} labelClassName={LABEL_CLASS}>
              {(id) => (
                <>
                  <input id={id} {...register("guestName")} placeholder="Rahul Sharma" className="input-resort w-full" />
                  {errors.guestName && <p role="alert" className="text-red-500 text-xs mt-1">{errors.guestName.message}</p>}
                </>
              )}
            </Field>
            <Field label={<>{t("email")} *</>} labelClassName={LABEL_CLASS}>
              {(id) => (
                <>
                  <input id={id} {...register("guestEmail")} type="email" placeholder="rahul@email.com" className="input-resort w-full" />
                  {errors.guestEmail && <p role="alert" className="text-red-500 text-xs mt-1">{errors.guestEmail.message}</p>}
                </>
              )}
            </Field>
            <Field label={<>{t("phone")} *</>} labelClassName={LABEL_CLASS}>
              {(id) => (
                <>
                  <input id={id} {...register("guestPhone")} type="tel" placeholder="98765 43210" className="input-resort w-full" />
                  {errors.guestPhone && <p role="alert" className="text-red-500 text-xs mt-1">{errors.guestPhone.message}</p>}
                </>
              )}
            </Field>
            <Field label={t("specialRequests")} labelClassName={LABEL_CLASS}>
              {(id) => (
                <textarea id={id} {...register("specialRequests")} rows={3} placeholder={t("specialRequestsPlaceholder")} className="input-resort w-full resize-none" />
              )}
            </Field>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep("room")} className="btn-outline flex-1">← Back</button>
            <button onClick={continueFromDetails} className="btn-primary flex-1">Continue →</button>
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
              {/* One line per room type, with the extra beds named. A party
                  paying for a rollaway has to be able to see it before they
                  agree to the total, not discover it on the invoice. */}
              {plan.lines.map((line) => (
                <div key={line.roomType} className="flex justify-between">
                  <span className="text-earth-text/70">
                    {line.rooms > 1 ? `${line.rooms} × ` : ""}{line.name}
                  </span>
                  <span className="font-semibold text-right">
                    {line.extraBeds > 0 && (
                      <span className="block text-xs font-normal text-earth-text/70">
                        + {line.extraBeds} extra {line.extraBeds === 1 ? "bed" : "beds"}
                      </span>
                    )}
                  </span>
                </div>
              ))}
              <div className="flex justify-between"><span className="text-earth-text/70">Check-in</span><span>{format(new Date(checkIn), "dd MMM yyyy")}</span></div>
              <div className="flex justify-between"><span className="text-earth-text/70">Check-out</span><span>{format(new Date(checkOut), "dd MMM yyyy")}</span></div>
              <div className="flex justify-between"><span className="text-earth-text/70">Guests</span><span>{guests}</span></div>
              <div className="flex justify-between"><span className="text-earth-text/70">Rooms</span><span>{selectedRooms}{plan.totalExtraBeds > 0 ? ` (+${plan.totalExtraBeds} extra ${plan.totalExtraBeds === 1 ? "bed" : "beds"})` : ""}</span></div>

              {/* Room charges and GST are itemised so the total is checkable
                  against what Razorpay opens for, rather than a bare number
                  the guest has to take on trust. Discount (if a promo code
                  applied) is drawn from the same server response — never
                  computed here — for the same reason. */}
              {displayTotals ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-earth-text/70">{t("roomCharges")}</span>
                    <span>₹{displayTotals.subtotal.toLocaleString("en-IN")}</span>
                  </div>
                  {displayTotals.discountAmount > 0 && (
                    <div className="flex justify-between text-primary">
                      <span className="text-earth-text/70">Discount ({appliedPromoCode})</span>
                      <span>−₹{displayTotals.discountAmount.toLocaleString("en-IN")}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-earth-text/70">{t("taxes")}</span>
                    <span>₹{displayTotals.taxAmount.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="border-t border-primary-200 pt-2 mt-2 flex justify-between font-semibold text-primary text-base">
                    <span>{t("totalAmount")}</span>
                    <span>₹{displayTotals.totalAmount.toLocaleString("en-IN")}</span>
                  </div>
                </>
              ) : (
                <div role="status" className="border-t border-primary-200 pt-2 mt-2 text-earth-text/70">
                  {quoteLoading ? t("priceLoading") : t("priceUnavailable")}
                </div>
              )}
            </div>

            {/* Promo code — previewed read-only against /api/booking/promo/preview
                so the discount shown here is real, not guessed client-side.
                The actual redemption is only claimed once "Confirm Booking" is
                pressed; see createBooking's PROMO_INVALID handling. */}
            <div className="mb-6">
              <Field label={t("promoCode")} labelClassName={LABEL_CLASS}>
                {(id) => (
                  <div className="flex gap-2">
                    <input
                      id={id}
                      type="text"
                      value={promoCode}
                  onChange={(e) => {
                    setPromoCode(e.target.value);
                    // Editing after a successful apply must not leave a stale
                    // discount showing for a code that is no longer the one typed.
                    if (appliedPromoCode) {
                      setAppliedPromoCode(null);
                      setPromoPreview(null);
                    }
                  }}
                      placeholder={t("promoPlaceholder")}
                      className="input-resort flex-1"
                    />
                    <button
                      type="button"
                      onClick={applyPromo}
                      disabled={promoChecking || !promoCode.trim() || !partyHoused}
                      className="btn-outline text-sm px-4 disabled:opacity-50"
                    >
                      {promoChecking ? t("promoChecking") : t("promoApply")}
                    </button>
                  </div>
                )}
              </Field>
              {/* Announced either way. Pressing Apply used to change a line of
                  text well below the button and say nothing at all to anyone
                  not watching that line. */}
              {promoPreview && !promoPreview.valid && (
                <p role="alert" className="text-red-500 text-xs mt-1">{promoPreview.reason}</p>
              )}
              {appliedPromoCode && promoPreview?.valid && (
                <p role="status" className="text-primary text-xs mt-1">{t("promoApplied")}</p>
              )}
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
                  <p className="font-sans text-xs text-earth-text/70">Visa, Mastercard, RuPay, UPI, Net Banking</p>
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
                  <p className="font-sans text-xs text-earth-text/70">Scan QR with any UPI app (GPay, PhonePe, Paytm)</p>
                </div>
              </button>
            </div>

            {/* What the guest is agreeing to, beside the button that agrees to
                it. This screen asked for a card with no check-in times, no
                statement of what the total covers, and nothing about how to
                change the booking — all of which a guest goes looking for at
                exactly this moment, and leaves the page to find. */}
            <div className="border border-primary-200 rounded-sm p-4 mb-6 font-sans text-xs text-earth-text/70 space-y-1.5">
              <p className="font-medium text-earth-text text-sm">{t("policyTitle")}</p>
              <p>{t("policyTimes")}</p>
              <p>{t("policyTotal")}</p>
              <p>{t("policyHold")}</p>
              {/* The number is passed in rather than written into the string:
                  it is a property fact, and `lib/property.ts` is where those
                  are stated. */}
              <p>{t("policyChanges", { phone: PROPERTY.phone })}</p>
            </div>

            {/* Announced, not just shown. A guest who presses Confirm and is
                refused hears nothing otherwise. */}
            {error && (
              <p role="alert" className="text-red-500 font-sans text-sm mb-4">
                {error}
              </p>
            )}

            <div className="flex gap-3">
              <button type="button" onClick={() => setStep("details")} className="btn-outline flex-1">← Back</button>
              {/* No quote, no payment. Sending a guest to checkout without
                  having shown them a price is the bug this screen had. */}
              <button
                type="submit"
                disabled={loading || !displayTotals}
                className="btn-primary flex-1 disabled:opacity-50"
              >
                {loading ? "Processing..." : t("confirm")}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
