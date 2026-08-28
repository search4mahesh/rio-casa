/**
 * The activity log — /api/admin/audit.
 *
 * `audit_log` was written by seventeen code paths and read by none, so none of
 * its shape had ever been exercised. Three properties matter enough to pin:
 *
 *   1. It is owner-only. Every other admin surface tops out at `manager`, and a
 *      manager is inside the group the log exists to oversee.
 *   2. It hides `system` writes by default. A single website booking audits two
 *      or three rows under that actor; left in, they bury the staff action an
 *      owner opened the screen to find.
 *   3. Its date bounds are property-local *instants*, not `@db.Date` values.
 *      `created_at` is a timestamp, so a UTC-midnight bound silently drops
 *      everything logged between midnight and 05:30 IST.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockFindMany, mockCount, mockStaffFindMany } = vi.hoisted(() => ({
  mockFindMany: vi.fn().mockResolvedValue([]),
  mockCount: vi.fn().mockResolvedValue(0),
  mockStaffFindMany: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/admin-auth", () => ({
  verifyAdminToken: vi.fn(),
  resolveActiveStaff: vi.fn().mockResolvedValue({
    staffId: "s1", role: "owner", name: "Owner", email: "o@r.in",
  }),
  ADMIN_COOKIE: "admin_token",
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: { findMany: mockFindMany, count: mockCount },
    staff: { findMany: mockStaffFindMany },
  },
}));

import { GET } from "@/app/api/admin/audit/route";

function req(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/admin/audit");
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const r = new NextRequest(url.toString());
  r.cookies.set("admin_token", "mock_token");
  return r;
}

/** The `where` the route handed Prisma on its most recent findMany. */
function lastWhere() {
  return mockFindMany.mock.calls.at(-1)![0].where;
}

async function asRole(role: string) {
  const { resolveActiveStaff } = await import("@/lib/admin-auth");
  vi.mocked(resolveActiveStaff).mockResolvedValueOnce(
    { staffId: "x", role, name: "Someone", email: "s@r.in" } as never
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFindMany.mockResolvedValue([]);
  mockCount.mockResolvedValue(0);
  mockStaffFindMany.mockResolvedValue([]);
});

describe("access", () => {
  it("allows an owner", async () => {
    expect((await GET(req())).status).toBe(200);
  });

  // The gate is the feature. A manager who can read the audit trail knows its
  // coverage, which is most of what keeping one is for.
  it("refuses a manager with 403", async () => {
    await asRole("manager");
    const res = await GET(req());
    expect(res.status).toBe(403);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("refuses front desk with 403", async () => {
    await asRole("frontdesk");
    expect((await GET(req())).status).toBe(403);
  });

  it("refuses an unauthenticated caller with 401", async () => {
    const { resolveActiveStaff } = await import("@/lib/admin-auth");
    vi.mocked(resolveActiveStaff).mockResolvedValueOnce(null as never);
    expect((await GET(req())).status).toBe(401);
  });

  // An audit trail the application can edit is not evidence. There is no
  // mutating handler in this file and there should never be one.
  it("exposes no mutating handler", async () => {
    const mod = await import("@/app/api/admin/audit/route");
    expect(Object.keys(mod).sort()).toEqual(["GET"]);
  });
});

describe("who filter", () => {
  it("hides automated and guest-driven writes by default", async () => {
    await GET(req());
    expect(lastWhere().userId).toEqual({ not: "system" });
  });

  it("shows only system writes when asked", async () => {
    await GET(req({ actor: "system" }));
    expect(lastWhere().userId).toBe("system");
  });

  it("applies no actor filter for 'all'", async () => {
    await GET(req({ actor: "all" }));
    expect(lastWhere().userId).toBeUndefined();
  });

  it("narrows to one staff member, overriding the actor default", async () => {
    await GET(req({ staffId: "staff_7" }));
    expect(lastWhere().userId).toBe("staff_7");
  });

  it("rejects an unknown actor with 400", async () => {
    expect((await GET(req({ actor: "nonsense" }))).status).toBe(400);
  });
});

describe("what filter", () => {
  it("defaults to no action filter when none is asked for", async () => {
    await GET(req());
    expect(lastWhere().action).toBeUndefined();
  });

  it("'notable' selects the actions worth a second look", async () => {
    await GET(req({ category: "notable" }));
    const { in: actions } = lastWhere().action;
    expect(actions).toContain("blocked_dates_created");
    expect(actions).toContain("cancel_booking");
    // Routine bookkeeping is not notable.
    expect(actions).not.toContain("check_in");
  });

  it("a category selects every action in it", async () => {
    await GET(req({ category: "inventory" }));
    expect(lastWhere().action.in).toContain("update_room_status");
    expect(lastWhere().action.in).not.toContain("payment_received");
  });

  it("an explicit action wins over a category", async () => {
    await GET(req({ category: "inventory", action: "cancel_booking" }));
    expect(lastWhere().action).toBe("cancel_booking");
  });

  it("rejects an unknown category with 400", async () => {
    expect((await GET(req({ category: "sideways" }))).status).toBe(400);
  });
});

describe("date bounds are property-local instants, not UTC midnight", () => {
  // `created_at` is a timestamp. A `dateOnly` bound would start the day at
  // 00:00Z — 05:30 IST — losing every action taken in the small hours, which
  // is exactly when an audit trail earns its keep.
  it("starts 'from' at IST midnight, which is 18:30Z the day before", async () => {
    await GET(req({ from: "2026-08-01" }));
    expect(lastWhere().createdAt.gte.toISOString()).toBe("2026-07-31T18:30:00.000Z");
  });

  it("ends 'to' at IST midnight of the following day, so 'to' includes itself", async () => {
    await GET(req({ to: "2026-08-31" }));
    expect(lastWhere().createdAt.lt.toISOString()).toBe("2026-08-31T18:30:00.000Z");
  });

  it("rejects a malformed date with 400 rather than an empty 500", async () => {
    expect((await GET(req({ from: "01-08-2026" }))).status).toBe(400);
  });

  // The B-45 shape: the regex accepts it, `dateOnly` throws on it.
  it("rejects a date that does not exist with 400", async () => {
    expect((await GET(req({ from: "2026-02-30" }))).status).toBe(400);
  });
});

describe("paging", () => {
  it("never passes NaN to Prisma when the params are junk (B-41)", async () => {
    await GET(req({ page: "abc", pageSize: "xyz" }));
    const call = mockFindMany.mock.calls.at(-1)![0];
    expect(Number.isNaN(call.skip)).toBe(false);
    expect(Number.isNaN(call.take)).toBe(false);
    expect(call.skip).toBe(0);
  });

  it("caps pageSize so one request cannot pull the whole table", async () => {
    await GET(req({ pageSize: "100000" }));
    expect(mockFindMany.mock.calls.at(-1)![0].take).toBe(200);
  });
});

describe("actor resolution", () => {
  const row = {
    id: "a1", userId: "s9", action: "cancel_booking", entityType: "booking",
    entityId: "b1", oldValue: null, newValue: { reason: "guest called" },
    ipAddress: "1.2.3.4", createdAt: new Date("2026-08-01T10:00:00Z"),
  };

  it("resolves a staff id to a name and role", async () => {
    mockFindMany.mockResolvedValueOnce([row]);
    mockStaffFindMany.mockResolvedValueOnce([{ id: "s9", name: "Asha", role: "frontdesk" }]);

    const { data } = await (await GET(req())).json();
    expect(data.entries[0].actor).toEqual({ id: "s9", name: "Asha", role: "frontdesk" });
  });

  // An audit row must outlive the account that wrote it, so the name lookup
  // has to tolerate a miss rather than dropping the row.
  it("keeps a row whose staff account has since been deleted", async () => {
    mockFindMany.mockResolvedValueOnce([row]);
    mockStaffFindMany.mockResolvedValueOnce([]);

    const { data } = await (await GET(req())).json();
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0].actor.name).toBeNull();
  });

  it("does not look up a name for the system actor", async () => {
    mockFindMany.mockResolvedValueOnce([{ ...row, userId: "system" }]);
    await GET(req({ actor: "all" }));
    expect(mockStaffFindMany).not.toHaveBeenCalled();
  });
});
