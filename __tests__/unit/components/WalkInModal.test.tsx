// @vitest-environment jsdom
/**
 * B-12 / B-13 / B-14 — the walk-in modal.
 *
 * B-12: `nightlyRate` drives the whole `rateOverride` branch of `quoteStay` and
 *       is recorded in the audit log as `rateOverridden`, but the modal never
 *       collected it — the front desk could not negotiate a rate at all.
 * B-13: the date defaulted to `new Date().toISOString()`, which is the UTC day.
 *       Before 05:30 IST that is yesterday.
 * B-14: `try`/`finally` with no `catch`, so a rejected fetch left the modal
 *       sitting there having apparently done nothing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ showToast: vi.fn(), toast: null }),
  Toast: () => null,
}));

import { WalkInModal } from "@/components/admin/WalkInModal";
import { propertyDayString, dateOnly, addDays, toDayString } from "@/lib/dates";

const ROOMS = [{ id: "r1", name: "Deluxe Room", roomNumber: "201", pricePerNight: 5500 }];

/** The body of the POST to /api/admin/bookings/create, parsed. */
function postedBooking(fetchMock: ReturnType<typeof vi.fn>) {
  const call = fetchMock.mock.calls.find(([url]) => String(url).includes("/bookings/create"));
  return call ? JSON.parse((call[1] as RequestInit).body as string) : null;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async (url: string) => {
    if (String(url).includes("/rooms/status")) {
      return { ok: true, json: async () => ({ success: true, data: ROOMS }) };
    }
    return { ok: true, json: async () => ({ success: true, data: { id: "bk1" } }) };
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Fill the required fields and submit. */
async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>, opts: { rate?: string } = {}) {
  // The room list arrives from an effect, so every one of these tests has to
  // wait for it before it can choose a room. `findByRole` says that at the call
  // site; the window it waits in is set once in __tests__/setup.ts, because 1s
  // is too tight for a machine running the whole suite in parallel (B-77).
  await screen.findByRole("option", { name: /Deluxe Room/ });

  // Two selects on this form — room, then payment method.
  await user.selectOptions(screen.getAllByRole("combobox")[0], "r1");
  await user.type(screen.getByPlaceholderText("Full name"), "Asha Patil");
  await user.type(screen.getByPlaceholderText("9876543210"), "9876543210");

  if (opts.rate !== undefined) {
    await user.type(screen.getByLabelText(/Negotiated Rate/i), opts.rate);
  }

  await user.click(screen.getByRole("button", { name: /Create Booking/i }));
}

describe("WalkInModal — negotiated rate (B-12)", () => {
  it("offers a rate field at all", () => {
    render(<WalkInModal onClose={() => {}} />);
    expect(screen.getByLabelText(/Negotiated Rate/i)).toBeTruthy();
  });

  it("omits nightlyRate entirely when left blank", async () => {
    const user = userEvent.setup();
    render(<WalkInModal onClose={() => {}} />);
    await fillAndSubmit(user);

    await waitFor(() => expect(postedBooking(fetchMock)).not.toBeNull());
    const body = postedBooking(fetchMock);
    // Absent, not 0 or "" — the route reads an absent value as "use the tariff".
    expect(body).not.toHaveProperty("nightlyRate");
  });

  it("sends nightlyRate as a number when the desk negotiates one", async () => {
    const user = userEvent.setup();
    render(<WalkInModal onClose={() => {}} />);
    await fillAndSubmit(user, { rate: "4200" });

    await waitFor(() => expect(postedBooking(fetchMock)).not.toBeNull());
    expect(postedBooking(fetchMock).nightlyRate).toBe(4200);
  });

  it("rejects a non-positive rate before sending anything", async () => {
    const user = userEvent.setup();
    render(<WalkInModal onClose={() => {}} />);
    await fillAndSubmit(user, { rate: "0" });

    await waitFor(() => expect(screen.getByText(/positive amount/i)).toBeTruthy());
    expect(postedBooking(fetchMock)).toBeNull();
  });

  it("shows the standard tariff as a hint once a room is chosen", async () => {
    const user = userEvent.setup();
    render(<WalkInModal onClose={() => {}} />);
    await screen.findByRole("option", { name: /Deluxe Room/ });
    await user.selectOptions(screen.getAllByRole("combobox")[0], "r1");

    expect(screen.getByPlaceholderText(/Standard: ₹5500/)).toBeTruthy();
  });
});

describe("WalkInModal — default dates (B-13)", () => {
  it("defaults check-in to today at the property, not the UTC day", () => {
    render(<WalkInModal onClose={() => {}} />);

    const checkIn = screen.getByDisplayValue(propertyDayString()) as HTMLInputElement;
    expect(checkIn.value).toBe(propertyDayString());
  });

  it("defaults check-out to the following day", () => {
    render(<WalkInModal onClose={() => {}} />);

    const expected = toDayString(addDays(dateOnly(propertyDayString()), 1));
    expect(screen.getByDisplayValue(expected)).toBeTruthy();
  });
});

describe("WalkInModal — failures reach the user (B-14)", () => {
  it("shows a message when the request cannot be sent at all", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes("/rooms/status")) {
        return { ok: true, json: async () => ({ success: true, data: ROOMS }) };
      }
      throw new TypeError("Failed to fetch");
    });

    render(<WalkInModal onClose={() => {}} />);
    await fillAndSubmit(user);

    // Previously: unhandled rejection, no error state, modal apparently idle.
    await waitFor(() => expect(screen.getByText(/Could not reach the server/i)).toBeTruthy());
  });

  it("survives an error response with no JSON body", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes("/rooms/status")) {
        return { ok: true, json: async () => ({ success: true, data: ROOMS }) };
      }
      // What an unhandled route error actually returns.
      return { ok: false, json: async () => { throw new SyntaxError("Unexpected end of JSON input"); } };
    });

    render(<WalkInModal onClose={() => {}} />);
    await fillAndSubmit(user);

    await waitFor(() => expect(screen.getByText(/Failed to create booking/i)).toBeTruthy());
  });

  it("re-enables the button after a failure so the desk can retry", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes("/rooms/status")) {
        return { ok: true, json: async () => ({ success: true, data: ROOMS }) };
      }
      throw new TypeError("Failed to fetch");
    });

    render(<WalkInModal onClose={() => {}} />);
    await fillAndSubmit(user);

    await waitFor(() => expect(screen.getByText(/Could not reach the server/i)).toBeTruthy());
    const button = screen.getByRole("button", { name: /Create Booking/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it("closes on success", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<WalkInModal onClose={onClose} />);
    await fillAndSubmit(user);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
