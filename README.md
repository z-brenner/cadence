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
- No user-facing string literals in JSX. Go through `t()`.
- Feature flags hide UI. They never gate the API or delete data.
- Sizes are stored as numbers. The scale (points, t-shirt, hours) is display only.
- Every state change writes an `item_event` row. Reports are built from that log, so it must be written from day one.

## What is not here yet

- List, calendar, and timeline views (the profile declares them; only board is implemented).
- Reports. The `item_event` log and `daily_snapshot` table are in place; the aggregation job and charts are not.
- Labels, comments, dependencies, milestones have tables and no UI.
- Invitations UI. Better Auth's organization plugin has the API; wire it to a settings page.
- Realtime adapter.
