// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { nav } = vi.hoisted(() => ({ nav: { pathname: "/admin/dashboard" } }));

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => nav.pathname),
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import RoleGuard from "@/components/admin/RoleGuard";

function setPath(p: string) { nav.pathname = p; }

describe("RoleGuard — renders children when role is sufficient", () => {
  it("owner sees /admin/settings", () => {
    setPath("/admin/settings");
    render(<RoleGuard role="owner"><div>settings</div></RoleGuard>);
    expect(screen.getByText("settings")).toBeDefined();
    expect(screen.queryByText("Access Restricted")).toBeNull();
  });

  it("manager sees /admin/reports", () => {
    setPath("/admin/reports");
    render(<RoleGuard role="manager"><div>reports</div></RoleGuard>);
    expect(screen.getByText("reports")).toBeDefined();
  });

  it("frontdesk sees /admin/bookings", () => {
    setPath("/admin/bookings");
    render(<RoleGuard role="frontdesk"><div>bookings</div></RoleGuard>);
    expect(screen.getByText("bookings")).toBeDefined();
  });

  it("housekeeping sees /admin/housekeeping", () => {
    setPath("/admin/housekeeping");
    render(<RoleGuard role="housekeeping"><div>tasks</div></RoleGuard>);
    expect(screen.getByText("tasks")).toBeDefined();
  });
});

describe("RoleGuard — shows AccessDenied when role is insufficient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("frontdesk blocked from /admin/reports (manager required)", () => {
    setPath("/admin/reports");
    render(<RoleGuard role="frontdesk"><div>reports</div></RoleGuard>);
    expect(screen.queryByText("reports")).toBeNull();
    expect(screen.getByText("Access Restricted")).toBeDefined();
    expect(screen.getByText(/Manager/)).toBeDefined();
  });

  it("housekeeping blocked from /admin/bookings (frontdesk required)", () => {
    setPath("/admin/bookings");
    render(<RoleGuard role="housekeeping"><div>bookings</div></RoleGuard>);
    expect(screen.queryByText("bookings")).toBeNull();
    expect(screen.getByText("Access Restricted")).toBeDefined();
    expect(screen.getByText(/Front Desk/)).toBeDefined();
  });

  it("manager blocked from /admin/settings (owner required)", () => {
    setPath("/admin/settings");
    render(<RoleGuard role="manager"><div>settings</div></RoleGuard>);
    expect(screen.queryByText("settings")).toBeNull();
    expect(screen.getByText("Access Restricted")).toBeDefined();
    expect(screen.getByText(/Owner/)).toBeDefined();
  });

  it("shows Back to Dashboard link", () => {
    setPath("/admin/settings");
    render(<RoleGuard role="frontdesk"><div>x</div></RoleGuard>);
    const link = screen.getByRole("link", { name: /Back to Dashboard/i });
    expect((link as HTMLAnchorElement).href).toContain("/admin/dashboard");
  });
});

describe("RoleGuard — path matching edge cases", () => {
  it("sub-path /admin/reports/monthly also triggers the guard", () => {
    setPath("/admin/reports/monthly");
    render(<RoleGuard role="frontdesk"><div>data</div></RoleGuard>);
    expect(screen.queryByText("data")).toBeNull();
    expect(screen.getByText("Access Restricted")).toBeDefined();
  });

  it("unlisted path always renders children", () => {
    setPath("/admin/unknown-page");
    render(<RoleGuard role="housekeeping"><div>unlisted</div></RoleGuard>);
    expect(screen.getByText("unlisted")).toBeDefined();
  });
});
