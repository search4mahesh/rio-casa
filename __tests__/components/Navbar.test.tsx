// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Navbar from "@/components/layout/Navbar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      home: "Home", about: "About", rooms: "Rooms", gallery: "Gallery",
      dining: "Dining", blog: "Blog", bookNow: "Book Now",
    };
    return map[key] ?? key;
  },
}));

vi.mock("next/link", () => ({
  default: ({ href, children, className, onClick }: {
    href: string; children: React.ReactNode; className?: string; onClick?: () => void;
  }) => <a href={href} className={className} onClick={onClick}>{children}</a>,
}));

describe("Navbar", () => {
  it("renders the Rio Casa logo", () => {
    render(<Navbar locale="en" />);
    expect(screen.getByText("Rio Casa")).toBeInTheDocument();
    expect(screen.getByText("Mahabaleshwar")).toBeInTheDocument();
  });

  it("renders all navigation links", () => {
    render(<Navbar locale="en" />);
    expect(screen.getAllByText("Rooms").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Dining").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Gallery").length).toBeGreaterThan(0);
  });

  it("renders the Book Now CTA", () => {
    render(<Navbar locale="en" />);
    expect(screen.getAllByText("Book Now").length).toBeGreaterThan(0);
  });

  it("does NOT render a language switcher (English-only site)", () => {
    render(<Navbar locale="en" />);
    expect(screen.queryByText("हिं")).toBeNull();
    expect(screen.queryByText("मर")).toBeNull();
  });

  it("Book Now link points to /booking", () => {
    render(<Navbar locale="en" />);
    const bookLinks = screen.getAllByRole("link", { name: /book now/i });
    expect(bookLinks[0]).toHaveAttribute("href", "/booking");
  });
});
