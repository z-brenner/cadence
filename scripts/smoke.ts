/**
 * End-to-end smoke test against a real Postgres, through the real Hono app.
 * Usage: DATABASE_URL=postgres://... npx tsx scripts/smoke.ts
 * Requires migrations applied first (npm run db:migrate).
 */
import { createApp } from "../src/server/app";
import { closeDbPools, createDb, schema } from "../src/server/db";
import { snapshotWorkspace } from "../src/server/reports";
import { eq, sql } from "drizzle-orm";

const env = {
  DATABASE_URL: process.env.DATABASE_URL!,
  BETTER_AUTH_SECRET: "smoke-test-secret-smoke-test-secret",
  BETTER_AUTH_URL: "http://localhost",
  CRON_SECRET: "cron",
};
const app = createApp();
let cookie = "";

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await app.fetch(
    new Request("http://localhost" + path, {
      method,
      headers: { "content-type": "application/json", origin: "http://localhost", cookie, ...headers },
      body: body ? JSON.stringify(body) : undefined,
    }),
    env,
  );
  const set = res.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

function assert(cond: unknown, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exit(1); }
  console.log("ok  ", msg);
}

const email = `smoke-${Date.now()}@example.com`;
let r = await call("POST", "/api/auth/sign-up/email", { email, password: "password123", name: "Smoke" });
assert(r.status === 200, `sign up (${r.status} ${r.text.slice(0,200)})`);
assert(cookie, "session cookie set");

r = await call("GET", "/api/workspaces");
assert(r.status === 200 && Array.isArray(r.json) && r.json.length === 0, "empty workspace list");

r = await call("POST", "/api/auth/organization/create", { name: "Smoke Org", slug: `smoke-${Date.now()}` });
assert(r.status === 200 && r.json?.id, `create org (${r.status} ${r.text.slice(0, 80)})`);
const orgId = r.json.id;

r = await call("POST", "/api/workspaces", { organizationId: orgId, name: "Eng", slug: "eng", mode: "technical" });
assert(r.status === 201 && r.json?.id, "create technical workspace");
const wsId = r.json.id;

r = await call("GET", `/api/workspaces/${wsId}`);
assert(r.status === 200 && r.json.profile.terminology.item.one === "Issue", "resolved technical profile");
assert(r.json.stages.length === 5 && r.json.stages[4].isTerminal, "seeded 5 stages, last terminal");
const stages = r.json.stages;

r = await call("POST", `/api/workspaces/${wsId}/items`, { title: "First", size: 3 });
assert(r.status === 201 && r.json.number === 1, "create item #1");
const a = r.json.id;
r = await call("POST", `/api/workspaces/${wsId}/items`, { title: "Second", size: 5 });
assert(r.json.number === 2, "create item #2");
const b = r.json.id;

r = await call("POST", `/api/workspaces/${wsId}/items/${a}/move`, { stageId: stages[4].id });
assert(r.status === 200, "move #1 to Done");
r = await call("GET", `/api/workspaces/${wsId}/items`);
const moved = r.json.find((i: any) => i.id === a);
assert(moved.closedAt && moved.stageId === stages[4].id, "closedAt set on terminal stage");

r = await call("PATCH", `/api/workspaces/${wsId}/items/${a}`, { stageId: stages[2].id });
r = await call("GET", `/api/workspaces/${wsId}/items`);
assert(r.json.find((i: any) => i.id === a).closedAt === null, "reopened when moved off terminal stage");

r = await call("PATCH", `/api/workspaces/${wsId}/items/${b}`, { dueAt: "2026-10-01T12:00:00.000Z", size: 8 });
assert(r.status === 200, "patch dueAt and size");

// Reports
r = await call("POST", `/api/workspaces/${wsId}/items/${a}/move`, { stageId: stages[4].id });
r = await call("GET", `/api/workspaces/${wsId}/reports`);
assert(r.status === 200, `reports (${r.status} ${r.text.slice(0, 120)})`);
assert(r.json.progress.length === 1, "one snapshot day");
assert(r.json.progress[0].open === 8 && r.json.progress[0].closed === 3, `open 8 / closed 3 (got ${JSON.stringify(r.json.progress[0])})`);
assert(r.json.throughput.length === 12, `throughput has 12 zero-filled weeks (got ${r.json.throughput.length})`);
const thisWeek = r.json.throughput[11];
assert(thisWeek.count === 1 && thisWeek.size === 3, `throughput counts a re-closed item once (got ${JSON.stringify(thisWeek)})`);
assert(r.json.throughput.slice(0, 11).every((w: any) => w.count === 0), "earlier weeks are zero");
{
  const db0 = createDb(env.DATABASE_URL);
  const [{ label }] = await db0.execute<{ label: string }>(sql`select to_char(date_trunc('week', now()), 'IYYY-"W"IW') as label`).then((x: any) => x.rows ?? x);
  assert(thisWeek.week === label, `JS ISO week label matches Postgres (${thisWeek.week} vs ${label})`);
  // Year-boundary cases, JS vs Postgres, so a refactor of isoWeekLabel cannot silently drift.
  const { isoWeekLabel } = await import("../src/server/reports");
  const dates = ["2026-09-28", "2026-01-01", "2025-12-29", "2024-12-30", "2021-01-03", "2020-12-31", "2027-01-03", "2032-12-31"];
  const pg = await db0.execute<{ d: string; l: string }>(sql`select d, to_char(date_trunc('week', d::timestamp), 'IYYY-"W"IW') as l from jsonb_array_elements_text(${JSON.stringify(dates)}::jsonb) d`).then((x: any) => x.rows ?? x);
  assert(pg.every((r: any) => isoWeekLabel(new Date(r.d + "T00:00:00Z")) === r.l), `ISO week labels match Postgres at year boundaries (${pg.map((r: any) => r.l).join(",")})`);
}
assert(r.json.flow[0].byStage[stages[4].id] === 1, "flow shows 1 item in Done");

// Event log
const db = createDb(env.DATABASE_URL);
const events = await db.select().from(schema.itemEvent).where(eq(schema.itemEvent.workspaceId, wsId));
const kinds = events.map((e) => e.kind).sort();
assert(kinds.filter((k) => k === "closed").length === 2 && kinds.includes("reopened"), `event log has closed x2 + reopened (${kinds.join(",")})`);

// Cron
r = await call("GET", "/api/cron/snapshots");
assert(r.status === 401, "cron rejects missing secret");
r = await call("GET", "/api/cron/snapshots", undefined, { authorization: "Bearer cron" });
assert(r.status === 200 && r.json.workspaces >= 1, "cron runs with secret");
await snapshotWorkspace(db, wsId); // idempotent re-run
r = await call("GET", `/api/workspaces/${wsId}/reports`);
assert(r.json.progress.length === 1, "snapshot upsert is idempotent");

// Cycle-scoped report: active-cycle detection must not depend on process TZ
const now = Date.now();
r = await call("POST", `/api/workspaces/${wsId}/cycles`, { name: "Sprint 1", startsAt: new Date(now - 3 * 3600_000).toISOString(), endsAt: new Date(now + 3 * 3600_000).toISOString() });
assert(r.status === 201, "create active cycle");
const cycleId = r.json.id;
r = await call("PATCH", `/api/workspaces/${wsId}/items/${a}`, { cycleId });
assert(r.status === 200 && r.json.cycleId === cycleId, "PATCH returns updated row with cycleId");
r = await call("GET", `/api/workspaces/${wsId}/reports?cycleId=${cycleId}`);
assert(r.json.progress.length === 1 && r.json.progress[0].closed === 3 && r.json.progress[0].open === 0, `cycle-scoped snapshot written for active cycle under TZ=${process.env.TZ ?? "unset"} (got ${JSON.stringify(r.json.progress)})`);
assert(r.json.throughput[11].count === 1, "cycle-scoped throughput");

// Move returns the row with closedAt derived server-side
r = await call("POST", `/api/workspaces/${wsId}/items/${b}/move`, { stageId: stages[4].id });
assert(r.status === 200 && r.json.closedAt && r.json.id === b, "move returns updated row with closedAt");
r = await call("POST", `/api/workspaces/${wsId}/items/${b}/move`, { stageId: stages[1].id });
assert(r.json.closedAt === null, "move off terminal clears closedAt in response");
r = await call("POST", `/api/workspaces/${wsId}/items/${b}/move`, { stageId: "not-a-stage" });
assert(r.status === 400, "move to foreign stage rejected");

// Mode switch keeps data
r = await call("PATCH", `/api/workspaces/${wsId}`, { mode: "knowledge" });
r = await call("GET", `/api/workspaces/${wsId}`);
assert(r.json.profile.terminology.item.one === "Task", "switched to knowledge mode");
r = await call("GET", `/api/workspaces/${wsId}/items`);
assert(r.json.length === 2 && r.json.find((i: any) => i.id === b).size === 8, "items and sizes survive mode switch");

// Permission boundary
cookie = "";
r = await call("POST", "/api/auth/sign-up/email", { email: `other-${Date.now()}@example.com`, password: "password123", name: "Other" });
r = await call("GET", `/api/workspaces/${wsId}`);
assert(r.status === 404, "non-member cannot read workspace");
cookie = "";
r = await call("GET", `/api/workspaces/${wsId}`);
assert(r.status === 401, "anonymous gets 401");

// Pool reuse: many createDb calls must not open many connections
{
  const before = Number((await db.execute(sql`select count(*)::int as n from pg_stat_activity where datname = current_database()`).then((x: any) => (x.rows ?? x)[0].n)));
  for (let i = 0; i < 25; i++) await createDb(env.DATABASE_URL).execute(sql`select 1`);
  const after = Number((await db.execute(sql`select count(*)::int as n from pg_stat_activity where datname = current_database()`).then((x: any) => (x.rows ?? x)[0].n)));
  assert(after - before <= 10, `createDb reuses a pool (connections ${before} -> ${after})`);
}

console.log("\nALL PASS");
await closeDbPools();
