// @vitest-environment jsdom
/**
 * The party size is set on the room step, beside the rooms it has to fit into.
 *
 * Two things have to hold for that to be an improvement rather than a nuisance.
 * The counter has to re-pick the best-value combination as the number changes —
 * otherwise the guest is left composing a party of six out of four card
 * steppers by hand. And it must stop doing that the moment the guest picks
 * rooms themselves, or every press of "+" silently discards their choice.
 *
 * Availability is deliberately not refetched: party size stopped being a filter
 * on the room list with B-57, so only the suggestion depends on it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const MESSAGES: Record<string, string> = {
  guests: "Number of Guests",
  guestsDecrease: "Fewer guests",
  guestsIncrease: "More guests",
  selectRoom: "Select Room",
  perNight: "per night",
};
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => MESSAGES[key] ?? key,
}));

import BookingWizard from "@/components/booking/BookingWizard";

const room = (id: string, roomType: string, name: string, pricePerNight: number, maxGuests = 2) => ({
  id,
  name,
  slug: `${roomType}-${id}`,
  pricePerNight,
  maxGuests,
  amenities: [],
  images: [],
  roomType,
  extraBed: true,
  extraBedRate: 1000,
});

/** Two standards and one family room free — enough to have a real choice. */
const FREE = [
  room("r101", "standard", "Standard Room", 4500),
  room("r102", "standard", "Standard Room", 4500),
  room("r105", "family", "Family Room", 7500, 4),
];

let availabilityCalls = 0;

beforeEach(() => {
  availabilityCalls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).includes("/api/booking/availability")) availabilityCalls++;
      // The quote is the server's business; this suite is about the selection.
      const body = String(url).includes("/api/booking/quote")
        ? { success: true, data: { nights: 2, subtotal: 0, cgstAmount: 0, sgstAmount: 0, taxAmount: 0, totalAmount: 0, lines: [] } }
        : { success: true, data: FREE };
      return { status: 200, ok: true, json: async () => body };
    })
  );
});
afterEach(() => vi.unstubAllGlobals());

/** Advance to the room step and hand back a driver for the two counters. */
async function toRoomStep() {
  const user = userEvent.setup();
  render(<BookingWizard locale="en" />);
  await user.click(screen.getByRole("button", { name: /Continue to Room Selection/ }));
  await screen.findByRole("group", { name: "Number of Guests" });

  const party = screen.getByRole("group", { name: "Number of Guests" });
  return {
    user,
    partySize: () => Number(party.textContent!.replace(/\D+/g, "")),
    morePeople: () => user.click(within(party).getByRole("button", { name: /more/i })),
    fewerPeople: () => user.click(within(party).getByRole("button", { name: /fewer/i })),
    // Every card's stepper is labelled "Rooms" — deliberately, since it names
    // the −/+ pair rather than the card — so a card is found through its own
    // "One more <room>" button instead.
    roomsOf: (name: string) =>
      Number(
        screen
          .getByRole("button", { name: `One more ${name}` })
          .closest('[role="group"]')!
          .textContent!.replace(/\D+/g, "")
      ),
    addRoom: (name: string) => user.click(screen.getByRole("button", { name: `One more ${name}` })),
    removeRoom: (name: string) =>
      user.click(screen.getByRole("button", { name: `One fewer ${name}` })),
  };
}

describe("party size on the room step", () => {
  it("starts on the combination suggested for the party", async () => {
    const w = await toRoomStep();
    // Default party of 2: one standard, no rollaway.
    expect(w.partySize()).toBe(2);
    expect(w.roomsOf("Standard Room")).toBe(1);
    expect(screen.getByText(/sleeps 2 of 2/)).toBeTruthy();
  });

  it("re-picks the combination as the party grows", async () => {
    const w = await toRoomStep();

    // 4 guests fit one family room (₹7,500) more cheaply than two standards.
    await w.morePeople();
    await w.morePeople();
    await waitFor(() => expect(w.partySize()).toBe(4));
    await waitFor(() => expect(screen.getByText(/sleeps 4 of 4/)).toBeTruthy());
  });

  it("tells a party larger than any one room that it needs more than one", async () => {
    const w = await toRoomStep();
    for (let i = 0; i < 4; i++) await w.morePeople();
    await waitFor(() => expect(w.partySize()).toBe(6));
    expect(screen.getByText(/our largest room sleeps 5/)).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/sleeps 6 of 6/)).toBeTruthy());
  });

  it("does not refetch availability — party size is not a filter (B-57)", async () => {
    const w = await toRoomStep();
    expect(availabilityCalls).toBe(1);

    await w.morePeople();
    await w.morePeople();
    await waitFor(() => expect(w.partySize()).toBe(4));
    expect(availabilityCalls).toBe(1);
  });

  it("stops re-suggesting once the guest has chosen rooms themselves", async () => {
    const w = await toRoomStep();

    // The guest overrides us: two standards rather than the one we picked.
    await w.addRoom("Standard Room");
    await waitFor(() => expect(w.roomsOf("Standard Room")).toBe(2));
    expect(screen.queryByText(/We have picked the best-value rooms/)).toBeNull();

    // Growing the party must keep their two standards, not swap in a family room.
    await w.morePeople();
    await w.morePeople();
    await waitFor(() => expect(w.partySize()).toBe(4));
    expect(w.roomsOf("Standard Room")).toBe(2);
  });

  it("will not go below one guest", async () => {
    const w = await toRoomStep();
    await w.fewerPeople();
    await waitFor(() => expect(w.partySize()).toBe(1));

    const party = screen.getByRole("group", { name: "Number of Guests" });
    expect(within(party).getByRole("button", { name: /fewer/i })).toBeDisabled();
  });
});
