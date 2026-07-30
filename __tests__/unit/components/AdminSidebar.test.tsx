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

  it("shows Today and Housekeeping", () => {
    render(<AdminSidebar staff={staff("housekeeping")} />);
    expect(screen.getAllByText("Today").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Housekeeping").length).toBeGreaterThan(0);
  });

  it("hides frontdesk+ items", () => {
    render(<AdminSidebar staff={staff("housekeeping")} />);
    expect(screen.queryByText("Bookings")).toBeNull();
    expect(screen.queryByText("Guests")).toBeNull();
    expect(screen.queryByText("Calendar")).toBeNull();
    expect(screen.queryByText("Money")).toBeNull();
  });

  it("hides manager+ items", () => {
    render(<AdminSidebar staff={staff("housekeeping")} />);
    expect(screen.queryByText("Setup")).toBeNull();
  });
});

describe("AdminSidebar — frontdesk role", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows ops items including Bookings, Guests and Money", () => {
    render(<AdminSidebar staff={staff("frontdesk")} />);
    expect(screen.getAllByText("Bookings").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Guests").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Calendar").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Money").length).toBeGreaterThan(0);
  });

  it("hides the manager-only Setup hub", () => {
    render(<AdminSidebar staff={staff("frontdesk")} />);
    expect(screen.queryByText("Setup")).toBeNull();
  });
});

describe("AdminSidebar — manager role", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows every hub including Setup", () => {
    render(<AdminSidebar staff={staff("manager")} />);
    expect(screen.getAllByText("Setup").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Money").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Calendar").length).toBeGreaterThan(0);
  });
});

describe("AdminSidebar — owner role", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows all seven items", () => {
    render(<AdminSidebar staff={staff("owner")} />);
    for (const label of ["Today", "Calendar", "Bookings", "Guests", "Housekeeping", "Money", "Setup"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });
});
