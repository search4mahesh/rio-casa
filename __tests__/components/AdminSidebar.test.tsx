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

// Use owner role so all nav items (including Settings) are visible
const staff: AdminPayload = {
  staffId: "s1",
  name: "Ravi Kumar",
  email: "ravi@riocasa.in",
  role: "owner",
};

describe("AdminSidebar", () => {
  it("renders all navigation groups", () => {
    render(<AdminSidebar staff={staff} />);
    expect(screen.getAllByText("Operations").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Finance").length).toBeGreaterThan(0);
  });

  it("renders all expected nav items", () => {
    render(<AdminSidebar staff={staff} />);
    expect(screen.getAllByText("Dashboard").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Front Desk").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Bookings").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Guests").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Housekeeping").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Invoices").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Expenses").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Reconciliation").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Settings").length).toBeGreaterThan(0);
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

  it("highlights the active route (dashboard)", () => {
    render(<AdminSidebar staff={staff} />);
    // The active dashboard link should have the active class
    const links = screen.getAllByRole("link", { name: /dashboard/i });
    const activeLink = links.find((l) => l.classList.contains("bg-[#3d5636]"));
    expect(activeLink).toBeTruthy();
  });
});
