---
name: test-in-chrome
description: Drive the Rio Casa app in a live Chrome browser via the chrome-devtools MCP server — click through flows, read console errors and network requests, check layout at a given width, profile a slow page. Use when a change needs interactive testing rather than a single screenshot, or when diagnosing a client-side error, a failing fetch, or a performance problem.
---

# Testing Rio Casa in Chrome

The `chrome-devtools` MCP server (configured in `.mcp.json`) drives a real
Chrome window and exposes DevTools: the accessibility tree, console, network
panel, and performance traces.

**Pick the right tool for the job.** For "does this page still render", the
[run-app](../run-app/SKILL.md) skill's `scripts/shot.mjs` is one command and
one PNG — faster than a browser session. Reach for Chrome MCP when you need to
*interact* (click, fill, submit) or *inspect* (why did that fetch 500, what is
the console saying, why is this slow).

## Before anything else: start the dev server

The MCP server drives a browser; it does not start the app. From
[run-app](../run-app/SKILL.md):

```bash
(npm run dev > /tmp/riocasa-dev.log 2>&1 &)
timeout 90 bash -c 'until curl -sf http://localhost:3000 >/dev/null 2>&1; do sleep 2; done'
```

Next compiles routes on demand, so the **first** navigation to a route can
take 10–30s even once the server answers. Prefer `wait_for` on real page text
over assuming a navigation finished.

## Logging into the admin panel

Admin pages redirect to `/admin/login` without an `admin_token` cookie. Don't
drive the login form — POST to the API from the page, exactly as `shot.mjs`
does. The cookie lands in the browser context and every later navigation is
authenticated:

1. `new_page` → `http://localhost:3000/admin/login`
2. `evaluate_script`:

```js
async () => {
  const res = await fetch("/api/admin/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Paste the owner password from `npm run seed:admin` / `.env` —
    // an inline literal here is what B-59 was about.
    body: JSON.stringify({ email: "admin@riocasa.in", password: "<SHOT_OWNER_PASSWORD>" }),
  });
  return { status: res.status, body: await res.text() };
}
```

3. `navigate_page` → the admin page you actually want.

A 401 means staff aren't seeded — run `npm run seed:admin`.

| Role | Email | Password env var |
|---|---|---|
| owner | admin@riocasa.in | `SHOT_OWNER_PASSWORD` |
| manager | manager@riocasa.in | `SHOT_MANAGER_PASSWORD` |
| frontdesk | frontdesk@riocasa.in | `SHOT_FRONTDESK_PASSWORD` |
| housekeeping | housekeeping@riocasa.in | `SHOT_HOUSEKEEPING_PASSWORD` |

Passwords are **not** written down here or anywhere else in the repository —
that is how the seeded owner password ended up published in git (B-59).
`npm run seed:admin` prints a random one per account, once; put them in `.env`
under the names above. `shot.mjs` reads them from there and errors clearly when
one is missing.

Log in as the **lowest role that should see the page** when testing access.
`PAGE_MIN_ROLE` in `lib/rbac-utils.ts` gates each route, and a role that is
too low silently redirects to the dashboard — which looks like a broken link
rather than a permission check doing its job.

The server runs `--isolated`, so each session starts from a clean profile with
no cookies. That's deliberate: a stale `admin_token` from a previous run
otherwise hides auth regressions. It also means you log in once per session.

## Interacting with a page

`take_snapshot` first — it returns the accessibility tree with a `uid` for
each element, and `click` / `fill` / `hover` take those uids. Snapshot again
after anything that re-renders; uids are invalidated by navigation and by
React re-renders.

`fill_form` sets several fields in one call, which is the fast path through
the booking wizard and the admin forms.

## Reading what went wrong

- `list_console_messages` — everything since the last navigation. Panels fetch
  after mount, so call this *after* the data has loaded, not straight after
  `navigate_page`.
- `list_network_requests` then `get_network_request` — the response body of a
  failing API call. This is the fastest way to tell a 500 in the route handler
  from a client that misread the payload.

  Every API route answers in the `lib/api-response.ts` shape: `{ success,
  data }` or `{ success, error }`. A panel showing "undefined" usually means
  the client read `data.foo` where it should read `data.data`.
- `take_screenshot` — what it actually looks like. Read the PNG; a page can
  render its shell while every fetch behind it 500s.

## Layout and width

The viewport defaults to 1536x900, the width where the admin grids tend to
break (sidebar takes 240px, leaving ~1248px). Use `resize_page` to reproduce a
specific window before concluding content is missing — **admin grids scroll
horizontally**, so a narrow screenshot hides real columns rather than proving
they are gone.

`emulate` covers dark mode, CPU/network throttling, and geolocation.

## Performance

`performance_start_trace` (with `reload: true`, `autoStop: true`) →
`performance_stop_trace` → `performance_analyze_insight` for a named insight.
Worth doing on the admin calendar and the booking wizard, which render the
most at once.

Note that **dev-server timings are not production timings** — Next serves
unminified bundles and compiles on demand. Use traces to compare before/after
on the same server, not to judge absolute speed. For that, `npm run build &&
npm start` first.

`lighthouse_audit` covers accessibility and SEO on the public marketing pages,
where those actually matter.

## Gotchas

- **The dev server must already be running.** A blank page or
  `ERR_CONNECTION_REFUSED` almost always means it isn't, or it died — check
  `/tmp/riocasa-dev.log`.
- **Chrome stays open between calls.** Reuse the page rather than opening a
  new one per step; `list_pages` and `select_page` when you lose track.
- **`--isolated` wipes the profile on close**, so nothing you do here touches
  a personal Chrome profile — and nothing persists across sessions.
- **i18n routes**: `/hi/...` and `/mr/...` are prefixed, `en` is not. Missing
  translation keys surface as console warnings, so check the console when
  testing a locale.
