// @vitest-environment jsdom
/**
 * B-49 — every control in the guest booking wizard was unlabelled.
 *
 * Eight bare `<label>`s, no `htmlFor`, no ids, no aria anywhere. A screen
 * reader announced each field as an unlabelled box and clicking "Check-out
 * Date" did not focus its input. `components/ui/Field.tsx` exists so this
 * cannot happen and the public contact form already used it — the wizard, the
 * one form every booking passes through, was simply outside the guard in
 * `field-labels.test.tsx`, which grepped `components/admin app/admin` only.
 *
 * `getByLabelText` performs the same lookup assistive technology does, so
 * these fail for exactly the reason a screen-reader user would suffer.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// The wizard reads copy through next-intl; echo the key's last segment so the
// tests assert against real rendered text without pinning the copy itself.
const MESSAGES: Record<string, string> = {
  checkIn: "Check-in Date",
  checkOut: "Check-out Date",
  guests: "Number of Guests",
  guestsDecrease: "Fewer guests",
  guestsIncrease: "More guests",
  name: "Full Name",
  email: "Email Address",
  phone: "Phone Number",
  specialRequests: "Special Requests",
  promoCode: "Promo Code",
};
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => MESSAGES[key] ?? key,
}));

import BookingWizard from "@/components/booking/BookingWizard";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      status: 200,
      ok: true,
      json: async () => ({ success: true, data: [] }),
    }))
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("booking wizard — step 1 controls are named (B-49)", () => {
  it("associates the date labels with their inputs", () => {
    render(<BookingWizard locale="en" />);

    // Both of these threw before: the labels named nothing.
    expect(screen.getByLabelText("Check-in Date")).toHaveProperty("type", "date");
    expect(screen.getByLabelText("Check-out Date")).toHaveProperty("type", "date");
  });

  it("focuses the check-out input when its label is clicked", async () => {
    const user = userEvent.setup();
    render(<BookingWizard locale="en" />);

    await user.click(screen.getByText("Check-out Date"));
    expect(document.activeElement).toBe(screen.getByLabelText("Check-out Date"));
  });

  it("names the guest counter as a group rather than mislabelling a button", () => {
    render(<BookingWizard locale="en" />);

    // A `<label>` over a pair of buttons names nothing at all — CLAUDE.md calls
    // for a `<span id>` plus role/aria-labelledby, which is what this asserts.
    const group = screen.getByRole("group", { name: "Number of Guests" });
    expect(within(group).getAllByRole("button")).toHaveLength(2);
  });

  it("gives the counter buttons their own accessible names", () => {
    render(<BookingWizard locale="en" />);

    const group = screen.getByRole("group", { name: "Number of Guests" });
    // "−" and "+" are punctuation to a screen reader without these.
    expect(within(group).getByRole("button", { name: /fewer/i })).toBeTruthy();
    expect(within(group).getByRole("button", { name: /more/i })).toBeTruthy();
  });

  it("leaves no unlabelled control anywhere on the step", () => {
    const { container } = render(<BookingWizard locale="en" />);

    const unnamed = [...container.querySelectorAll("input, select, textarea")].filter((el) => {
      const id = el.getAttribute("id");
      const hasFor = id ? !!container.querySelector(`label[for="${CSS.escape(id)}"]`) : false;
      return !hasFor && !el.closest("label") && !el.getAttribute("aria-label") && !el.getAttribute("aria-labelledby");
    });

    expect(unnamed.map((e) => e.getAttribute("name") ?? e.getAttribute("type"))).toEqual([]);
  });
});
