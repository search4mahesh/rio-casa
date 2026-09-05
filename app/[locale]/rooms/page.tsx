import { getTranslations } from "next-intl/server";
import Link from "next/link";
import Image from "next/image";
import { Users, Star, Bath, BedDouble } from "lucide-react";
import { getRoomCategories } from "@/lib/room-catalogue";
import { catalogueAvailability } from "@/lib/booking-service";
import { addDays, dateOnly, today, toDayString } from "@/lib/dates";
import { pageMetadata } from "@/lib/page-metadata";
import StaySearchForm from "@/components/booking/StaySearchForm";
// Shared with /rooms/[slug], which carries the same pair of dates one link
// away — see lib/stay-params.ts.
import { humanDay, readStay } from "@/lib/stay-params";

export const generateMetadata = () => pageMetadata("rooms", "/rooms");

export const dynamic = "force-dynamic";

const HORIZON_DAYS = 60;

export default async function RoomsPage({
  searchParams,
}: {
  searchParams: { checkIn?: string; checkOut?: string };
}) {
  const t = await getTranslations("rooms");
  // Live inventory — see lib/room-catalogue.ts. This list used to be hardcoded
  // and had drifted into advertising a room type the property does not own,
  // while never mentioning the four Standard rooms.
  const rooms = await getRoomCategories();

  const stay = readStay(searchParams);
  const tomorrow = toDayString(addDays(today(), 1));

  // Free rooms per type for the dates asked about, and — for any type with
  // none — the next day the stay would fit. Deliberately a shared function in
  // `lib/booking-service.ts` rather than a query of this page's own: the
  // catalogue and the booking wizard must not be able to disagree about what
  // is free, and both now resolve "free" through the same predicate.
  //
  // One call rather than two because the horizon window contains the stay, so
  // the second answer costs no extra round trip: the page reads three, not
  // seven.
  let freeByType: Record<string, number> = {};
  let nextFree: Record<string, string | null> = {};
  if (stay.kind === "stay") {
    ({ freeByType, nextFreeByType: nextFree } = await catalogueAvailability(
      stay.checkIn,
      stay.checkOut,
      HORIZON_DAYS
    ));
  }

  /** Carry the chosen dates into the wizard so the guest does not retype them. */
  const bookHref = (slug: string) =>
    stay.kind === "stay"
      ? `/booking?room=${slug}&checkIn=${toDayString(stay.checkIn)}&checkOut=${toDayString(stay.checkOut)}`
      : `/booking?room=${slug}`;

  return (
    <div className="py-16 bg-earth-bg min-h-screen">
      <div className="container-resort">
        <div className="text-center mb-8">
          <p className="section-subheading mb-2">{t("subtitle")}</p>
          <h1 className="section-heading">{t("title")}</h1>
          <p className="font-sans text-earth-text/70 mt-3 max-w-xl mx-auto text-sm">
            {t("stayPolicy")}
          </p>
        </div>

        {/* The same component the home page's hero uses, so the two cannot
            disagree about what a valid stay is. Still a plain `<form
            method="get">` — the dates land in the URL, the result is
            shareable and bookmarkable, and this page stays a server component.
            The client island buys the one thing a server component cannot do:
            floor check-out at the day after check-in while the guest is still
            choosing. Both inputs used to be floored at tomorrow, so "check in
            on the 5th, check out on the 3rd" was reachable in the native
            picker and only rejected after a round trip. */}
        <StaySearchForm
          minCheckIn={tomorrow}
          defaultCheckIn={stay.kind === "stay" ? toDayString(stay.checkIn) : searchParams.checkIn}
          defaultCheckOut={stay.kind === "stay" ? toDayString(stay.checkOut) : searchParams.checkOut}
          showNights={false}
          className="bg-earth-white rounded-sm shadow-sm p-5 mb-10 max-w-3xl mx-auto"
        >
          {stay.kind === "error" && (
            <p className="font-sans text-sm text-red-600 mt-3">{t(stay.message)}</p>
          )}
          {stay.kind === "none" && (
            <p className="font-sans text-xs text-earth-text/70 mt-3">{t("datesHint")}</p>
          )}
          {stay.kind === "stay" && (
            <p className="font-sans text-xs text-earth-text/70 mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>
                {stay.nights === 1
                  ? t("showingForOne", {
                      from: humanDay(toDayString(stay.checkIn)),
                      to: humanDay(toDayString(stay.checkOut)),
                    })
                  : t("showingFor", {
                      nights: stay.nights,
                      from: humanDay(toDayString(stay.checkIn)),
                      to: humanDay(toDayString(stay.checkOut)),
                    })}
              </span>
              <Link href="/rooms" className="text-primary underline">
                {t("clearDates")}
              </Link>
            </p>
          )}
        </StaySearchForm>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {rooms.map((room) => {
            const count = freeByType[room.roomType] ?? 0;
            const soldOut = stay.kind === "stay" && count === 0;
            const free = stay.kind === "stay" && count > 0;
            const nextDay = soldOut ? nextFree[room.roomType] ?? null : null;

            return (
            <div
              key={room.slug}
              className={`bg-earth-white rounded-sm shadow-sm overflow-hidden hover:shadow-md transition-shadow flex flex-col ${
                soldOut ? "opacity-75" : ""
              }`}
            >
              {/* Image */}
              <div className="relative h-56 overflow-hidden group">
                <Image
                  src={room.marketing.heroImage}
                  alt={room.marketing.heroAlt}
                  fill
                  className={`object-cover transition-transform duration-500 ${
                    soldOut ? "grayscale" : "group-hover:scale-105"
                  }`}
                  sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                />
                {room.marketing.highlight && (
                  <span className="absolute top-3 left-3 bg-accent text-white text-xs font-sans font-medium px-2.5 py-1 rounded-full flex items-center gap-1.5 z-10">
                    {room.marketing.highlight === "Bathtub" && <Bath size={11} />}
                    {room.marketing.highlight === "2 Double Beds" && <BedDouble size={11} />}
                    {room.marketing.highlight}
                  </span>
                )}
                {/* The card stays on the page when the type is booked out — it
                    describes a room the property owns, and dropping it would
                    tell a visitor there is no family room at all. What changes
                    is the claim it makes and the action it offers. */}
                {soldOut && (
                  <span className="absolute top-3 right-3 bg-earth-text/85 text-earth-white text-xs font-sans px-2.5 py-1 rounded-full z-10">
                    {t("notAvailable")}
                  </span>
                )}
              </div>

              <div className="p-6 flex flex-col flex-1">
                <div className="flex items-start justify-between mb-2">
                  <h2 className="font-serif text-2xl text-earth-text">{room.name}</h2>
                  <div className="flex items-center gap-1 text-accent shrink-0">
                    <Star size={14} fill="currentColor" />
                    <span className="font-sans text-sm">{room.marketing.rating}</span>
                    <span className="text-earth-text/70 text-xs">({room.marketing.reviews})</span>
                  </div>
                </div>

                <p className="font-sans text-sm text-earth-text/70 mb-4 leading-relaxed flex-1">
                  {room.description}
                </p>

                <div className="flex flex-wrap gap-2 mb-5">
                  {room.amenities.map((amenity) => (
                    <span key={amenity} className="font-sans text-xs bg-primary/5 text-primary px-2.5 py-1 rounded-full">
                      {amenity}
                    </span>
                  ))}
                </div>

                {/* Scarcity only when it is real — "1 room left" on every card
                    reads as a sales tactic and stops being read. Same rule as
                    the booking wizard's cards. */}
                {free && (
                  <p className={`font-sans text-xs mb-3 ${count <= 2 ? "text-accent" : "text-primary"}`}>
                    {count === 1 ? t("oneRoomLeft") : t("roomsLeft", { count })}
                  </p>
                )}
                {soldOut && (
                  <p className="font-sans text-xs text-earth-text/70 mb-3">
                    {nextDay
                      ? t("nextFree", { date: humanDay(nextDay) })
                      : t("noNextFree", { days: HORIZON_DAYS })}
                  </p>
                )}

                <div className="flex items-center justify-between pt-4 border-t border-primary/10">
                  <div className="flex items-center gap-4">
                    <div>
                      <span className="font-serif text-2xl text-primary">
                        ₹{room.pricePerNight.toLocaleString("en-IN")}
                      </span>
                      <span className="font-sans text-xs text-earth-text/70 ml-1">{t("perNight")}</span>
                    </div>
                    <div className="flex items-center gap-1 text-earth-text/70 text-sm">
                      <Users size={14} />
                      <span>{t("maxGuests", { count: room.maxGuests })}</span>
                    </div>
                  </div>
                  {/* A booked-out card offers the next date that works rather
                      than a button that leads to the same empty answer. */}
                  {soldOut && nextDay ? (
                    <Link
                      href={`/rooms?checkIn=${nextDay}&checkOut=${toDayString(addDays(dateOnly(nextDay), stay.kind === "stay" ? stay.nights : 1))}`}
                      className="btn-outline text-sm py-2 px-5"
                    >
                      {t("seeNextFree", { date: humanDay(nextDay) })}
                    </Link>
                  ) : (
                    <Link
                      href={bookHref(room.slug)}
                      className={`text-sm py-2 px-5 ${soldOut ? "btn-outline" : "btn-primary"}`}
                    >
                      {t("bookRoom")}
                    </Link>
                  )}
                </div>
              </div>
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
