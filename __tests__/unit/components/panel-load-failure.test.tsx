// @vitest-environment jsdom
/**
 * B-39 — what an admin panel does when its data will not load.
 *
 * Two things used to go wrong, and both are visible only in a rendered
 * component, which is why this is not an API test:
 *
 *   1. `await res.json()` threw on an empty 500 body (and `fetch` rejected
 *      outright when the network dropped), so the `setLoading(false)` below it
 *      never ran. The panel sat on "Loading…" until the page was reloaded —
 *      no error, no retry, nothing to click.
 *   2. Had it got past that, the panel fell through to its *empty* state:
 *      "No promo codes yet". That is a different claim entirely — it tells
 *      staff the property has no promo codes when in fact we never managed to
 *      ask.
 *
 * Promos stands in for the ~20 panels converted together; they all went
 * through `apiJson` + `ErrorState` in the same shape.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ showToast: vi.fn(), toast: null }),
  Toast: () => null,
}));

import PromosPanel from "@/components/admin/panels/Promos";

const okEnvelope = {
  status: 200,
  ok: true,
  json: async () => ({ success: true, data: [] }),
};

/** An unhandled route error: HTTP 500 with a zero-byte body. */
const emptyServerError = {
  status: 500,
  ok: false,
  json: async () => {
    throw new SyntaxError("Unexpected end of JSON input");
  },
};

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe("an admin panel whose load fails", () => {
  it("does not sit on 'Loading…' forever when the body is an empty 500", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => emptyServerError));

    render(<PromosPanel />);

    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
  });

  it("does not sit on 'Loading…' forever when the network is down", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));

    render(<PromosPanel />);

    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
    expect(await screen.findByText(/could not reach the server/i)).toBeInTheDocument();
  });

  it("says the load failed instead of claiming there is no data", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => emptyServerError));

    render(<PromosPanel />);

    expect(await screen.findByText(/server ran into a problem/i)).toBeInTheDocument();
    // The misleading half of the bug: this is the *empty* state, and it must
    // not stand in for a failed one.
    expect(screen.queryByText("No promo codes yet")).not.toBeInTheDocument();
  });

  it("offers a retry that actually re-requests, and recovers", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(emptyServerError)   // first load fails
      .mockResolvedValue(okEnvelope);            // retry succeeds
    vi.stubGlobal("fetch", fetchMock);

    render(<PromosPanel />);

    const retry = await screen.findByRole("button", { name: /try again/i });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await userEvent.click(retry);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    // Recovered: the error is gone and the real empty state is now the honest
    // answer, because this time we did manage to ask.
    await waitFor(() =>
      expect(screen.queryByText(/server ran into a problem/i)).not.toBeInTheDocument()
    );
    expect(await screen.findByText("No promo codes yet")).toBeInTheDocument();
  });
});
