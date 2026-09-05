"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarDays } from "lucide-react";
import { Field } from "@/components/ui/Field";
import { addDays, dateOnly, daysBetween, isDayString, toDayString } from "@/lib/dates";

/**
 * The stay the guest is asking about — check-in, check-out, and a submit that
 * puts both in the query string.
 *
 * One component for the hero and for `/rooms`, deliberately. They ask the same
 * question and must not be able to disagree about what a valid answer is: the
 * two used to be one form on `/rooms` and two buttons on the home page that
 * asked nothing at all, so a visitor arriving from a search result had to find
 * the catalogue before they could find out whether the property was even free.
 *
 * Still a plain `<form method="get">`. The result is a real URL — shareable,
 * bookmarkable, and it works with JavaScript off — which is why the page it
 * submits to can stay a server component. What the client island buys is the
 * one thing a server component cannot do: react to the *first* input while the
 * guest is still filling in the second.
 *
 * `minCheckIn` arrives as a prop rather than being computed here. `today()`
 * answers in the property's timezone, and a client component that called it
 * during render would compute it twice — once server-side, once on hydration —
 * for a mismatch either side of IST midnight.
 */
export default function StaySearchForm({
  action,
  minCheckIn,
  defaultCheckIn = "",
  defaultCheckOut = "",
  heading,
  showNights = true,
  className = "bg-earth-white rounded-sm shadow-sm p-5",
  children,
}: {
  /** Where the GET lands. Omitted submits to the current page. */
  action?: string;
  /** Earliest bookable check-in, as `YYYY-MM-DD`, from the server. */
  minCheckIn: string;
  defaultCheckIn?: string;
  defaultCheckOut?: string;
  heading?: React.ReactNode;
  /**
   * Whether to state the nights the two inputs currently span.
   *
   * Off on /rooms, where the page already summarises the *submitted* stay
   * underneath ("2 nights · 20 Sept to 22 Sept") and two counts of the same
   * nights, one above the other, read as a bug rather than as the live
   * feedback this is meant to be.
   */
  showNights?: boolean;
  className?: string;
  /** Notes under the form — the caller's errors, hints and result summary. */
  children?: React.ReactNode;
}) {
  const t = useTranslations("rooms");

  const [checkIn, setCheckIn] = useState(defaultCheckIn);
  const [checkOut, setCheckOut] = useState(defaultCheckOut);

  const nights = nightsBetween(checkIn, checkOut);
  // A check-out floored at tomorrow rather than at the day after check-in is
  // how "check in on the 5th, check out on the 3rd" stayed reachable: the
  // native picker allowed it and the page only rejected it after a round trip.
  const minCheckOut = shiftDay(checkIn || minCheckIn, 1);

  /**
   * Move check-out along with check-in when it would otherwise be left behind.
   *
   * Only when it is now impossible — a guest who has already chosen a later
   * check-out keeps it, since bringing the arrival forward usually means a
   * longer stay rather than a different departure.
   */
  function changeCheckIn(next: string) {
    setCheckIn(next);
    if (next && (!checkOut || checkOut <= next)) setCheckOut(shiftDay(next, 1));
  }

  return (
    <form method="get" action={action} className={className}>
      <p className="font-sans text-sm text-earth-text mb-3 flex items-center gap-2">
        <CalendarDays size={16} className="text-primary" />
        {heading ?? t("datesHeading")}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 sm:items-end">
        <Field label={t("checkIn")} labelClassName={LABEL_CLASS}>
          {(id) => (
            <input
              id={id}
              name="checkIn"
              type="date"
              min={minCheckIn}
              value={checkIn}
              onChange={(e) => changeCheckIn(e.target.value)}
              className="input-resort w-full"
            />
          )}
        </Field>
        <Field label={t("checkOut")} labelClassName={LABEL_CLASS}>
          {(id) => (
            <input
              id={id}
              name="checkOut"
              type="date"
              min={minCheckOut}
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
              className="input-resort w-full"
            />
          )}
        </Field>
        <button type="submit" className="btn-primary text-sm py-2.5 px-6 whitespace-nowrap">
          {t("checkDates")}
        </button>
      </div>

      {/* The stay as chosen, before it is submitted. Without it the guest
          cannot tell a three-night stay from a four-night one without counting
          on the calendar they just closed. */}
      {showNights && nights > 0 && (
        <p className="font-sans text-xs text-primary mt-2" aria-live="polite">
          {nights === 1 ? t("oneNight") : t("nightCount", { count: nights })}
        </p>
      )}

      {children}
    </form>
  );
}

const LABEL_CLASS = "font-sans text-xs text-earth-text/70 block mb-1";

/** `YYYY-MM-DD` shifted by whole days, left alone if it is not a real day. */
function shiftDay(day: string, n: number): string {
  return isDayString(day) ? toDayString(addDays(dateOnly(day), n)) : day;
}

/** Nights between two `YYYY-MM-DD` inputs; 0 while either is unset or invalid. */
function nightsBetween(from: string, to: string): number {
  if (!isDayString(from) || !isDayString(to)) return 0;
  return Math.max(0, daysBetween(dateOnly(from), dateOnly(to)));
}
