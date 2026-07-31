// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AdminSidebar from "@/components/admin/AdminSidebar";
import type { AdminPayload } from "@/lib/admin-auth";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/dashboard",
  useRouter: () => ({ push: vi.fn() }),
}));

global.fetch = vi.fn().mockResolvedValue({
  json: () => Promise.resolve({ success: false }),
}) as unknown as typeof fetch;

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

// Use owner role so every nav item is visible
const staff: AdminPayload = {
  staffId: "s1",
  name: "Ravi Kumar",
  email: "ravi@riocasa.in",
  role: "owner",
};

describe("AdminSidebar", () => {
  it("renders the seven top-level nav items", () => {
    render(<AdminSidebar staff={staff} />);
    for (const label of [
      "Today",
      "Calendar",
      "Bookings",
      "Guests",
      "Housekeeping",
      "Money",
      "Setup",
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it("does not render pages that moved inside a hub as top-level items", () => {
    render(<AdminSidebar staff={staff} />);
    // These are now tabs within Money / Setup / Calendar, not sidebar entries.
    for (const label of [
      "Invoices",
      "Expenses",
      "Reconciliation",
      "Reports",
      "Night Audit",
      "Rate Plans",
      "Promo Codes",
      "Settings",
      "Blocked Dates",
      "Front Desk",
    ]) {
      expect(screen.queryByText(label)).toBeNull();
    }
  });

  it("shows the logged-in staff name and role", () => {
    render(<AdminSidebar staff={staff} />);
    expect(screen.getAllByText("Ravi Kumar").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Owner").length).toBeGreaterThan(0);
  });

  it("shows sign out button", () => {
    render(<AdminSidebar staff={staff} />);
    expect(screen.getAllByText(/sign out/i).length).toBeGreaterThan(0);
  });

  it("highlights the active route (Today)", () => {
    render(<AdminSidebar staff={staff} />);
    const links = screen.getAllByRole("link", { name: /today/i });
    const activeLink = links.find((l) => l.classList.contains("bg-primary-600"));
    expect(activeLink).toBeTruthy();
  });
});
