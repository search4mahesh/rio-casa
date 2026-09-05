// @vitest-environment jsdom
/**
 * The controls a thumb has to hit.
 *
 * Three of them were too small to hit reliably, and all three were the only way
 * to do the thing they controlled: the booking wizard's room steppers at 32px,
 * its guest counter at 36px — the two most-pressed controls in the funnel, at
 * two different sizes nobody had decided on — and the testimonial dots at 10px,
 * under even the 24px WCAG 2.5.8 floor.
 *
 * jsdom has no layout, so these cannot measure a rendered box. They assert the
 * sizing classes instead, which is what `focus-visible.test.ts` does and for the
 * same reason: the failure being guarded against is someone hand-writing a
 * smaller size again, and that is visible in the source.
 *
 * The carousel tests below *are* behavioural — moving between quotes is
 * something jsdom can genuinely exercise.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    if (key === "testimonialGoTo") return `Show testimonial ${values?.index} of ${values?.total}`;
    if (key === "testimonialRating") return `Rated ${values?.rating} out of 5`;
    const flat: Record<string, string> = {
      testimonialsTitle: "What our guests say",
      testimonialsLabel: "Guest reviews",
      testimonialPrevious: "Previous review",
      testimonialNext: "Next review",
    };
    return flat[key] ?? key;
  },
}));

import Testimonials from "@/components/sections/Testimonials";

const QUOTES = [
  { id: "t1", guestName: "Asha", location: "Pune", review: "Wonderful stay.", rating: 5, stayDate: "March 2026" },
  { id: "t2", guestName: "Vikram", location: "Mumbai", review: "Quiet and green.", rating: 4, stayDate: null },
  { id: "t3", guestName: "Neha", location: null, review: "We will be back.", rating: 5, stayDate: null },
];

/** 44px is `w-11`/`h-11` in this project's Tailwind scale (2.75rem). */
const IS_44PX = /\bw-11\b/;

describe("tap target sizes", () => {
  it("gives the wizard's counters one 44px class, not four hand-written sizes", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const rule = css.slice(css.indexOf(".stepper-button"));
    const body = rule.slice(0, rule.indexOf("}"));
    expect(body).toMatch(IS_44PX);
    expect(body).toMatch(/\bh-11\b/);

    // Both counters go through it, so they cannot drift to different sizes
    // again — the guest counter and the room steppers were 36px and 32px.
    const wizard = readFileSync("components/booking/BookingWizard.tsx", "utf8");
    expect(wizard.match(/stepper-button/g) ?? []).toHaveLength(4);
    expect(wizard).not.toMatch(/w-8 h-8 rounded-full border/);
    expect(wizard).not.toMatch(/w-9 h-9 rounded-full border/);
  });

  it("wraps each 10px testimonial dot in a 44px button", () => {
    render(<Testimonials testimonials={QUOTES} />);

    for (let i = 1; i <= QUOTES.length; i++) {
      const dot = screen.getByRole("button", { name: `Show testimonial ${i} of 3` });
      expect(dot.className).toMatch(IS_44PX);
      // The visual dot stays small; it is the target around it that grew.
      expect(dot.querySelector("span")?.className).toMatch(/w-2\.5/);
    }
  });

  it("makes the arrows the same size as the dots", () => {
    render(<Testimonials testimonials={QUOTES} />);
    expect(screen.getByRole("button", { name: "Previous review" }).className).toMatch(IS_44PX);
    expect(screen.getByRole("button", { name: "Next review" }).className).toMatch(IS_44PX);
  });
});

describe("testimonial carousel", () => {
  it("says which quote is showing", () => {
    render(<Testimonials testimonials={QUOTES} />);
    const first = screen.getByRole("button", { name: "Show testimonial 1 of 3" });
    expect(first.getAttribute("aria-current")).toBe("true");
    expect(
      screen.getByRole("button", { name: "Show testimonial 2 of 3" }).getAttribute("aria-current")
    ).toBeNull();
  });

  it("moves to a quote when its dot is pressed", async () => {
    const user = userEvent.setup();
    render(<Testimonials testimonials={QUOTES} />);

    await user.click(screen.getByRole("button", { name: "Show testimonial 3 of 3" }));
    expect(screen.getByText(/We will be back/)).toBeTruthy();
    expect(screen.queryByText(/Wonderful stay/)).toBeNull();
  });

  it("steps forward and back, which hunting for the right dot is not", async () => {
    const user = userEvent.setup();
    render(<Testimonials testimonials={QUOTES} />);

    await user.click(screen.getByRole("button", { name: "Next review" }));
    expect(screen.getByText(/Quiet and green/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Previous review" }));
    expect(screen.getByText(/Wonderful stay/)).toBeTruthy();
  });

  it("wraps at both ends rather than dead-ending", async () => {
    const user = userEvent.setup();
    render(<Testimonials testimonials={QUOTES} />);

    await user.click(screen.getByRole("button", { name: "Previous review" }));
    expect(screen.getByText(/We will be back/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Next review" }));
    expect(screen.getByText(/Wonderful stay/)).toBeTruthy();
  });

  /** Five drawn stars announce as nothing at all without this. */
  it("states the rating in words, not only in stars", () => {
    render(<Testimonials testimonials={QUOTES} />);
    expect(screen.getByRole("img", { name: "Rated 5 out of 5" })).toBeTruthy();
  });

  /**
   * Controls that cannot go anywhere are worse than no controls: they invite a
   * press and then do nothing.
   */
  it("shows no controls at all for a single quote", () => {
    render(<Testimonials testimonials={[QUOTES[0]]} />);
    expect(screen.queryByRole("button", { name: "Next review" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Show testimonial/ })).toBeNull();
  });

  // `isApproved` defaults to false, so a fresh property has none — an empty
  // quote card with a stray dot beneath it reads as broken.
  it("stands the section down when there is nothing approved", () => {
    const { container } = render(<Testimonials testimonials={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
