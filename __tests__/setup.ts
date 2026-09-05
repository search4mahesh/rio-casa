import { beforeEach, vi } from "vitest";
import "@testing-library/jest-dom";
import { configure } from "@testing-library/dom";

// testing-library defaults `waitFor` and every `findBy*` to a 1s window. That
// is ample on an idle machine and too tight for one running 85 test files in
// parallel forks: the assertion is about state that arrives eventually, and 1s
// was an arbitrary bound the environment could exceed under load (B-77).
// Raised here rather than per call site, so no future test has to remember.
configure({ asyncUtilTimeout: 5_000 });

// Per-tab storage outlives `cleanup()` — it belongs to the jsdom window, not
// to the render. The booking wizard remembers the guest’s dates and party
// size in `sessionStorage` between page loads, which is the point of it;
// without this the next test in the file starts on whatever the last one left
// behind, and the party-size tests opened on a party of nine.
beforeEach(() => {
  if (typeof sessionStorage !== "undefined") sessionStorage.clear();
  if (typeof localStorage !== "undefined") localStorage.clear();
});

// Set env vars used by lib modules
process.env.RAZORPAY_KEY_ID = "rzp_test_key_id";
process.env.RAZORPAY_KEY_SECRET = "test_secret_key_32chars_padding__";
process.env.JWT_SECRET = "test_jwt_secret_32_chars_padding__";

// `unstable_cache` and `revalidateTag` need Next's incremental cache, which
// only exists inside a request. Under vitest they throw, which would fail every
// test of a function that happens to be cached — `getTestimonials`,
// `getRoomCategories` — for a reason that has nothing to do with what those
// tests assert.
//
// Pass-through, so the tests still exercise the real query logic underneath.
// That the caching itself works is not something a mocked unit test could show
// anyway: it is verified from the build's prerender manifest, which records the
// revalidate window each route actually got.
vi.mock("next/cache", () => ({
  unstable_cache: <A extends unknown[], R>(fn: (...args: A) => R) => fn,
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));
