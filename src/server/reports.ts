import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { Db } from "./db";
import { schema } from "./db";

const { item, stage, cycle, itemEvent, dailySnapshot, workspace } = schema;

const pad = (n: number) => String(n).padStart(2, "0");
export const dayKey = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/**
 * Write today's snapshot for one workspace: one row for the whole workspace
 * (cycleId null) and one per cycle that is active today. Idempotent; re-running
 * on the same day overwrites. Cost is one aggregate query per row, so it is
 * safe to call lazily from the reports endpoint as well as from a cron.
 */
export async function snapshotWorkspace(db: Db, workspaceId: string, now = new Date()) {
  const day = dayKey(now);
  const stages = await db.select({ id: stage.id, isTerminal: stage.isTerminal }).from(stage).where(eq(stage.workspaceId, workspaceId));
  const terminal = new Set(stages.filter((s) => s.isTerminal).map((s) => s.id));

  const activeCycles = await db
    .select({ id: cycle.id })
    .from(cycle)
    .where(and(eq(cycle.workspaceId, workspaceId), sql`${cycle.startsAt} <= ${now}`, sql`${cycle.endsAt} >= ${now}`));

  const scopes: Array<string | null> = [null, ...activeCycles.map((c) => c.id)];
  for (const cycleId of scopes) {
    const rows = await db
      .select({ stageId: item.stageId, count: sql<number>`count(*)::int`, size: sql<number>`coalesce(sum(${item.size}), 0)::float` })
      .from(item)
      .where(and(eq(item.workspaceId, workspaceId), cycleId ? eq(item.cycleId, cycleId) : sql`true`))
      .groupBy(item.stageId);

    const byStage: Record<string, { count: number; size: number }> = {};
    let openSize = 0, closedSize = 0;
    for (const r of rows) {
      const k = r.stageId ?? "none";
      byStage[k] = { count: r.count, size: r.size };
      if (r.stageId && terminal.has(r.stageId)) closedSize += r.size; else openSize += r.size;
    }

    await db
      .insert(dailySnapshot)
      .values({ id: nanoid(), workspaceId, cycleId, day, byStage, openSize, closedSize })
      .onConflictDoUpdate({
        target: [dailySnapshot.workspaceId, dailySnapshot.cycleId, dailySnapshot.day],
        set: { byStage, openSize, closedSize },
      });
  }
}

/** Cron entry: snapshot every workspace. Fine up to a few hundred workspaces; shard after that. */
export async function snapshotAll(db: Db, now = new Date()) {
  const all = await db.select({ id: workspace.id }).from(workspace);
  for (const w of all) await snapshotWorkspace(db, w.id, now);
  return all.length;
}

export type Report = {
  /** Daily open vs closed size. Scoped to a cycle when cycleId given. */
  progress: Array<{ day: string; open: number; closed: number }>;
  /** Size closed per ISO week, last 12 weeks. */
  throughput: Array<{ week: string; size: number; count: number }>;
  /** Daily count per stage, last 30 days. Stage ids as keys. */
  flow: Array<{ day: string; byStage: Record<string, number> }>;
};

export async function buildReport(db: Db, workspaceId: string, cycleId: string | null, now = new Date()): Promise<Report> {
  // Make sure today is represented before reading.
  await snapshotWorkspace(db, workspaceId, now);

  const since = new Date(now.getTime() - 30 * 86_400_000);
  const snaps = await db
    .select()
    .from(dailySnapshot)
    .where(
      and(
        eq(dailySnapshot.workspaceId, workspaceId),
        cycleId ? eq(dailySnapshot.cycleId, cycleId) : isNull(dailySnapshot.cycleId),
        cycleId ? sql`true` : gte(dailySnapshot.day, dayKey(since)),
      ),
    )
    .orderBy(dailySnapshot.day);

  const progress = snaps.map((s) => ({ day: s.day, open: s.openSize, closed: s.closedSize }));
  const flow = snaps.map((s) => ({
    day: s.day,
    byStage: Object.fromEntries(Object.entries(s.byStage).map(([k, v]) => [k, v.count])),
  }));

  const twelveWeeks = new Date(now.getTime() - 84 * 86_400_000);
  const closed = await db
    .select({
      week: sql<string>`to_char(date_trunc('week', ${itemEvent.at}), 'IYYY-"W"IW')`,
      size: sql<number>`coalesce(sum(${item.size}), 0)::float`,
      count: sql<number>`count(*)::int`,
    })
    .from(itemEvent)
    .innerJoin(item, eq(item.id, itemEvent.itemId))
    .where(
      and(
        eq(itemEvent.workspaceId, workspaceId),
        eq(itemEvent.kind, "closed"),
        gte(itemEvent.at, twelveWeeks),
        cycleId ? eq(item.cycleId, cycleId) : sql`true`,
      ),
    )
    .groupBy(sql`1`)
    .orderBy(sql`1`);

  return { progress, throughput: closed, flow };
}
