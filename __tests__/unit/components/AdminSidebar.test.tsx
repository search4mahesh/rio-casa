// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/admin/dashboard"),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, onClick }: { href: string; children: React.ReactNode; onClick?: () => void }) => (
    <a href={href} onClick={onClick}>{children}</a>
  ),
}));

// Silence the maintenance-count fetch
global.fetch = vi.fn().mockResolvedValue({
  json: () => Promise.resolve({ success: false }),
}) as unknown as typeof fetch;

import AdminSidebar from "@/components/admin/AdminSidebar";
import type { AdminPayload } from "@/lib/admin-auth";

function staff(role: string): AdminPayload {
  return { staffId: "s1", name: "Test User", email: "test@riocasa.in", role };
}

describe("AdminSidebar — housekeeping role", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows Dashboard and Housekeeping", () => {
    render(<AdminSidebar staff={staff("housekeeping")} />);
    expect(screen.getAllByText("Dashboard").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Housekeeping").length).toBeGreaterThan(0);
  });

  it("hides frontdesk+ items", () => {
    render(<AdminSidebar staff={staff("housekeeping")} />);
    expect(screen.queryByText("Bookings")).toBeNull();
    expect(screen.queryByText("Guests")).toBeNull();
    expect(screen.queryByText("Calendar")).toBeNull();
    expect(screen.queryByText("Front Desk")).toBeNull();
    expect(screen.queryByText("Invoices")).toBeNull();
  });

  it("hides manager+ and owner items", () => {
    render(<AdminSidebar staff={staff("housekeeping")} />);
    expect(screen.queryByText("Reports")).toBeNull();
    expect(screen.queryByText("Night Audit")).toBeNull();
    expect(screen.queryByText("Expenses")).toBeNull();
    expect(screen.queryByText("Settings")).toBeNull();
  });
});

describe("AdminSidebar — frontdesk role", () => {
  it("shows ops items including Bookings, Guests, Invoices", () => {
    render(<AdminSidebar staff={staff("frontdesk")} />);
    expect(screen.getAllByText("Bookings").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Guests").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Invoices").length).toBeGreaterThan(0);
  });

  it("hides manager+ items", () => {
    render(<AdminSidebar staff={staff("frontdesk")} />);
    expect(screen.queryByText("Reports")).toBeNull();
    expect(screen.queryByText("Night Audit")).toBeNull();
    expect(screen.queryByText("Expenses")).toBeNull();
    expect(screen.queryByText("Reconciliation")).toBeNull();
    expect(screen.queryByText("Settings")).toBeNull();
  });
});

describe("AdminSidebar — manager role", () => {
  it("shows all manager-level items", () => {
    render(<AdminSidebar staff={staff("manager")} />);
    expect(screen.getAllByText("Reports").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Night Audit").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Expenses").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Reconciliation").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Rate Plans").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Promo Codes").length).toBeGreaterThan(0);
  });

  it("does NOT show Settings (owner-only)", () => {
    render(<AdminSidebar staff={staff("manager")} />);
    expect(screen.queryByText("Settings")).toBeNull();
  });
});

describe("AdminSidebar — owner role", () => {
  it("shows all items including Settings", () => {
    render(<AdminSidebar staff={staff("owner")} />);
    expect(screen.getAllByText("Settings").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Reports").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Bookings").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Housekeeping").length).toBeGreaterThan(0);
  });
});
