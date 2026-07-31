---
name: run-app
description: Launch the Rio Casa Next.js app and drive it in a real browser to see a change working — screenshots of admin or public pages, with admin login handled. Use when asked to run/start/screenshot the app, verify a UI change visually, or check a page renders without console errors.
---

# Running the Rio Casa app

Next.js 14 App Router + Prisma/Postgres (Neon) + Playwright for browser
driving. `DATABASE_URL` in `.env` points at a live Neon database, so the
app works without any local database setup.

## Start the dev server

```bash
(npm run dev > /tmp/riocasa-dev.log 2>&1 &)
timeout 90 bash -c 'until curl -sf http://localhost:3000 >/dev/null 2>&1; do sleep 2; done'
```

Poll the port — don't `sleep`. Next compiles routes on demand, so the
**first** request to a route can take 10–30s even after the server is up.

Stop it before relaunching, or the next run hits `EADDRINUSE`:

```bash
netstat -ano | grep ':3000.*LISTENING' | awk '{print $5}' | sort -u | xargs -r -n1 taskkill //F //PID
```

## Screenshot a page

`scripts/shot.mjs` wraps Playwright and handles admin login:

```bash
node scripts/shot.mjs "/admin/calendar?tab=month"   # admin, logs in as owner
node scripts/shot.mjs /admin/money --role manager   # a different role
node scripts/shot.mjs --path / --no-auth            # public site
node scripts/shot.mjs /admin/bookings --width 1280  # narrower viewport
node scripts/shot.mjs /admin/calendar --full        # full-page capture
```

Use `--path` for the site root. Git Bash (MSYS) rewrites a bare `/` into
`C:/Program Files/Git/`; the script undoes that, but `--path` is clearer.
Quote any path containing `?` so the shell doesn't glob it.

Output lands in `.screenshots/` (gitignored). The script prints the file
path and any console errors. **Read the PNG afterwards** — a page can
render its shell while every data fetch 500s.

Default viewport is 1536x900, which is the width where layout bugs in the
admin grids tend to show up (the sidebar takes 240px, leaving ~1248px).

## Auth

Staff accounts come from `prisma/seed-admin.ts`. If login fails with a 401,
they aren't seeded:

```bash
npm run seed:admin
```

| Role | Email | Password |
|---|---|---|
| owner | admin@riocasa.in | admin123 |
| manager | manager@riocasa.in | manager123 |
| frontdesk | frontdesk@riocasa.in | frontdesk123 |
| housekeeping | housekeeping@riocasa.in | hk123 |

`shot.mjs` POSTs to `/api/admin/auth/login` rather than filling the form —
fewer moving parts, and the `admin_token` cookie lands in the same browser
context. Role matters: pages are gated by `PAGE_MIN_ROLE` in
`lib/rbac-utils.ts`, and a role that's too low redirects to the dashboard.

## Inspecting the database

Ad-hoc Prisma scripts must live **inside the project** — a script in
`/tmp` cannot resolve `@prisma/client`:

```bash
cat > prisma/_probe.ts <<'EOF'
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
p.room.findMany().then(console.log).finally(() => p.$disconnect());
EOF
npx tsx prisma/_probe.ts
rm prisma/_probe.ts
```

`npx prisma studio` also works for browsing.

## Gotchas hit on this project

- **`tsx` + `/tmp` scripts fail** with `Cannot find module '@prisma/client'`.
  Keep throwaway scripts in `prisma/` or `scripts/`.
- **Git Bash mangles absolute-looking arguments.** `/` arrives as
  `C:/Program Files/Git/`. This once looked like a broken public homepage
  when the script had silently fallen back to an admin route without auth.
  Prefix with `MSYS_NO_PATHCONV=1`, or use `--path`.
- **Admin grids scroll horizontally.** A screenshot only shows what fits the
  viewport; content past the right edge is real but invisible. Use `--width`
  to reproduce a specific window size before concluding something is missing.
- **jsdom has no layout**, so unit tests cannot catch clipped/overflowing
  columns. Anything width-dependent needs a real browser screenshot.
- **Panels fetch after mount.** `shot.mjs` waits for "Loading…" to disappear;
  if you write your own driver, wait for content, not a fixed delay.
- **`vi.useFakeTimers()` deadlocks Testing Library's `waitFor`.** Use
  `vi.useFakeTimers({ shouldAdvanceTime: true })` in component tests.
- **`en-IN` renders September as "Sept"**, not "Sep" — derive month labels
  from `toLocaleDateString` in assertions rather than hardcoding them.
