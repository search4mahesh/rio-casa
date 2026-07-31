// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import CalendarMonthPanel from "@/components/admin/panels/CalendarMonth";

const EMPTY = { rooms: [], bookings: [], blockedDates: [] };

function mockCalendar(data: Partial<typeof EMPTY> = {}) {
  const fetchMock = vi.fn().mockResolvedValue({
    json: async () => ({ success: true, data: { ...EMPTY, ...data } }),
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

beforeEach(() => {
  // shouldAdvanceTime keeps real time flowing so Testing Library's waitFor
  // still settles; plain fake timers deadlock it.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  // 15 Aug 2026 — mid-month, so a window anchored on "today" must reach back
  // into early August and forward into September.
  vi.setSystemTime(new Date(2026, 7, 15));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function renderCal(data?: Partial<typeof EMPTY>) {
  const fetchMock = mockCalendar(data);
  render(<CalendarMonthPanel />);
  await waitFor(() => expect(screen.queryByText("Loading calendar…")).toBeNull());
  return fetchMock;
}

describe("calendar window — anchored on today, not the 1st", () => {
  it("requests a range starting before today, not the start of the month", async () => {
    const fetchMock = await renderCal();
    const url = String(fetchMock.mock.calls[0][0]);

    expect(url).toContain("from=2026-08-08"); // 15 Aug minus 7 days
    expect(url).not.toContain("from=2026-08-01");
    expect(url).toContain("days=90");
  });

  it("shows days before today so recent arrivals stay visible", async () => {
    await renderCal();
    // 8–14 Aug precede today and must be present in the grid.
    for (const d of ["8", "9", "10", "11", "12", "13", "14"]) {
      expect(screen.queryAllByText(d).length, `day ${d} missing`).toBeGreaterThan(0);
    }
  });

  it("includes today", async () => {
    await renderCal();
    expect(screen.queryAllByText("15").length).toBeGreaterThan(0);
  });

  it("runs past the end of the month into the next one", async () => {
    await renderCal();
    // The old month grid stopped at 31 Aug. A 90-day window from 8 Aug must
    // reach into September and beyond — this is the class of bug that made
    // the 31st fall off the edge.
    expect(screen.queryAllByText("31").length).toBeGreaterThan(0);
    // Derive the labels the same way the component does — en-IN renders
    // September as "Sept", so hardcoding "Sep" would fail for the wrong reason.
    const shortMonth = (monthIndex: number) =>
      new Date(2026, monthIndex, 1).toLocaleDateString("en-IN", { month: "short" });
    expect(screen.getAllByText(shortMonth(8)).length).toBeGreaterThan(0); // September
    expect(screen.getAllByText(shortMonth(9)).length).toBeGreaterThan(0); // October
  });

  it("labels the visible span rather than a single month", async () => {
    await renderCal();
    expect(screen.getByText(/Aug\s+–\s+Nov 2026/)).toBeTruthy();
  });
});

describe("blocked dates — regression: keys must not collide across months", () => {
  it("shades only the blocked day, not the same day-number in other months", async () => {
    // Keying cells by getDate() meant a block on 5 Sep also shaded 5 Aug,
    // 5 Oct and 5 Nov. Count the shaded cells for a single blocked date.
    const room = { id: "r1", name: "Deluxe", roomNumber: "101", roomType: "deluxe", floor: 1 };
    const { container } = (() => {
      mockCalendar({
        rooms: [room],
        blockedDates: [{ id: "b1", roomId: "r1", blockDate: "2026-09-05T00:00:00.000Z", reason: "Maintenance" }],
      });
      return render(<CalendarMonthPanel />);
    })();

    await waitFor(() => expect(screen.queryByText("Loading calendar…")).toBeNull());

    const shaded = Array.from(container.querySelectorAll<HTMLElement>("[style*='repeating-linear-gradient']"))
      // the legend swatch also uses the gradient — keep only grid cells
      .filter((el) => el.style.width === "40px");

    expect(shaded).toHaveLength(1);
  });
});
