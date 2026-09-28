# Cadence

Self-hosted work tracker with two modes over one data model.

- **Technical**: issues, epics, sprints, story points, branch and PR references, burndown and velocity.
- **Knowledge work**: tasks, projects, weekly cycles, S/M/L effort, due dates, approvers, recurring tasks.

A mode is a JSON profile in `modes/`. It renames things, hides things, and sets defaults. It never changes what the API stores. Switching a workspace from one mode to the other loses nothing.

## Stack

| Layer | Choice | Why |
|---|---|---|
| API | Hono | Runs natively on Cloudflare Workers and Vercel Functions with a one-file entry each. |
| Client | Vite + React SPA | Static files; both platforms serve them for free. |
| DB | Postgres via Drizzle + Neon HTTP driver | Same code on both runtimes. Any Postgres works behind Neon's proxy or Cloudflare Hyperdrive. |
| Auth | Better Auth + organizations plugin | Works on both runtimes, gives orgs, members, and invites without custom code. |
| Realtime | Polling (4s) | Fine for small teams. Add a `RealtimeAdapter` later if you need it. |

## Local development

```bash
npm install
cp .env.example .env            # for drizzle-kit and Vercel dev
cp .dev.vars.example .dev.vars  # for wrangler dev
# fill in DATABASE_URL and BETTER_AUTH_SECRET (openssl rand -base64 32) in both
npm run db:generate && npm run db:migrate
npm run dev                     # API on :8787, SPA on :5173 (proxied)
```

Open http://localhost:5173, create an account, then "New workspace". The first workspace creates an organization for you.

## Deploy to Cloudflare

```bash
npx wrangler login
npx wrangler secret put DATABASE_URL
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put BETTER_AUTH_URL     # https://cadence.<you>.workers.dev
npm run deploy:cloudflare
```

One Worker serves both the API and the static SPA (Workers Static Assets). If you want to use a non-Neon Postgres, create a Hyperdrive binding and pass its connection string as `DATABASE_URL`.

## Deploy to Vercel

```bash
npx vercel link
npx vercel env add DATABASE_URL
npx vercel env add BETTER_AUTH_SECRET
npx vercel env add BETTER_AUTH_URL          # https://<project>.vercel.app
npm run deploy:vercel
```

`vercel.json` routes `/api/*` to the single Hono function and everything else to the SPA.

## Adding a mode

1. Copy `modes/knowledge.json` to `modes/<id>.json` and edit it.
2. Import it in `src/server/modes.ts` and add it to the registry array.
3. The schema in `modes/schema.ts` validates it at build time. A bad profile fails the deploy, not a request.

Per-workspace overrides (`workspace.modeOverrides`) deep-merge on top of the profile, so a legal team can rename "Approver" to "Partner sign-off" without a new mode.

## Rules that keep it one product

- No `if (mode === "technical")` anywhere. Ask `features.*` instead.
- Domain nouns (item, container, cycle, stage, milestone, size, due date, dependency, reviewer, references, report names, actions) always go through `t()`. Generic chrome ("Loading", "Today", "Sign out") may be literal for now; a `ui` namespace on the profile is the planned home for it.
- Feature flags hide UI. They never gate the API or delete data.
- Sizes are stored as numbers. The scale (points, t-shirt, hours) is display only.
- Every state change writes an `item_event` row. Reports are built from that log, so it must be written from day one.

## Cycles

A cycle (Sprint in technical mode, Week in knowledge mode) is an inclusive span of calendar dates. The header filter shows the current cycle, any cycle, unassigned items, or everything; it defaults to the current cycle when that cycle has items, otherwise to everything, and after that the user owns it. Items created while a cycle is selected go into that cycle. "Manage" opens a panel to create the next cycle (starting the day after the latest one ends, with the length from `defaults.cycleLengthDays`), rename, adjust dates, or delete. Deleting a cycle unassigns its items.

## Reports

Three charts, each gated by `features.charts` in the mode profile and named by `terminology.reports`:

- progress: open vs closed size per day (Burndown in technical mode)
- throughput: size closed per ISO week, zero-filled to 12 consecutive weeks (Velocity in technical mode)
- flow: items per stage per day (Cumulative flow)

Progress and flow read from `daily_snapshot`, written once a day by a cron (Cloudflare: `[triggers]` in `wrangler.toml`; Vercel: `crons` in `vercel.json` calling `/api/cron/snapshots` with `CRON_SECRET`) and lazily whenever the reports page is opened, so the current day is always present. Throughput counts each currently closed item once, in the ISO week of its `closedAt`. Snapshot days are UTC dates; a user far west of UTC who opens reports late in their evening will see the row labeled with the next UTC day (issue #3). Chart colors are a validated colorblind-safe palette assigned in fixed stage order; a table view sits under the charts.

## Testing

`npm run smoke` runs 62 assertions through the real Hono app against a real Postgres: auth, org and workspace creation, items, board moves, event log, reports, cron, mode switching, and permission boundaries. CI runs it under two time zones. Point `DATABASE_URL` at a scratch database; the test creates its own users and never deletes anything. It exercises the node-postgres driver only; the Neon HTTP driver used on Cloudflare and Vercel is not covered by CI.

## What is not here yet

- Timeline view (#6).
- Labels, comments, dependencies, milestones have tables and no UI.
- Invitations UI. Better Auth's organization plugin has the API; wire it to a settings page.
- Realtime adapter.
- Deploys to Cloudflare and Vercel are wired per each platform's docs but not yet exercised on the platform.
