import { Hono } from "hono";
import { cors } from "hono/cors";
import { and, asc, desc, eq, max } from "drizzle-orm";
import { z } from "zod";
import { nanoid } from "nanoid";
import { createDb, type Db, schema } from "./db";
import { createAuth, type Auth, type AuthEnv } from "./auth";
import { resolveMode, listModes } from "./modes";
import { buildReport, snapshotAll } from "./reports";

export type Bindings = AuthEnv & {
  DATABASE_URL: string;
  APP_NAME?: string;
  /** Shared secret for the HTTP cron route. Only needed on platforms without a native scheduler (Vercel). */
  CRON_SECRET?: string;
};

type Variables = {
  db: Db;
  auth: Auth;
  user: { id: string; email: string; name: string } | null;
  session: { activeOrganizationId?: string | null } | null;
};

export type AppEnv = { Bindings: Bindings; Variables: Variables };

const { workspace, stage, container, cycle, milestone, item, itemEvent, member } = schema;

class AnchorError extends Error {}

export function createApp() {
  const app = new Hono<AppEnv>();

  app.use("/api/*", cors({ origin: (o) => o, credentials: true }));

  // Per-request wiring. Workers have no module-level singletons worth trusting.
  app.use("/api/*", async (c, next) => {
    const db = createDb(c.env.DATABASE_URL);
    const auth = createAuth(db, c.env);
    c.set("db", db);
    c.set("auth", auth);
    const s = await auth.api.getSession({ headers: c.req.raw.headers });
    c.set("user", s?.user ?? null);
    c.set("session", s?.session ?? null);
    await next();
  });

  app.on(["GET", "POST"], "/api/auth/*", (c) => c.get("auth").handler(c.req.raw));

  app.get("/api/health", (c) => c.json({ ok: true, app: c.env.APP_NAME ?? "Cadence" }));

  app.get("/api/modes", (c) => c.json(listModes()));

  // ------------------------------------------------------------------------
  // Auth guard for everything below
  // ------------------------------------------------------------------------
  app.use("/api/workspaces/*", async (c, next) => {
    if (!c.get("user")) return c.json({ error: "unauthorized" }, 401);
    await next();
  });
  app.use("/api/workspaces", async (c, next) => {
    if (!c.get("user")) return c.json({ error: "unauthorized" }, 401);
    await next();
  });

  /**
   * Verifies every reference in an item body points inside this workspace
   * (stages, containers, cycles, milestones) or this organization (users).
   * Returns the first offending field name, or null.
   */
  async function foreignRef(db: Db, ws: { id: string; organizationId: string }, body: Record<string, unknown>): Promise<string | null> {
    const checks: Array<[string, () => Promise<unknown[]>]> = [
      ["stageId", () => db.select({ id: stage.id }).from(stage).where(and(eq(stage.id, body.stageId as string), eq(stage.workspaceId, ws.id))).limit(1)],
      ["containerId", () => db.select({ id: container.id }).from(container).where(and(eq(container.id, body.containerId as string), eq(container.workspaceId, ws.id))).limit(1)],
      ["cycleId", () => db.select({ id: cycle.id }).from(cycle).where(and(eq(cycle.id, body.cycleId as string), eq(cycle.workspaceId, ws.id))).limit(1)],
      ["milestoneId", () => db.select({ id: milestone.id }).from(milestone).where(and(eq(milestone.id, body.milestoneId as string), eq(milestone.workspaceId, ws.id))).limit(1)],
      ["assigneeId", () => db.select({ id: member.id }).from(member).where(and(eq(member.userId, body.assigneeId as string), eq(member.organizationId, ws.organizationId))).limit(1)],
      ["reviewerId", () => db.select({ id: member.id }).from(member).where(and(eq(member.userId, body.reviewerId as string), eq(member.organizationId, ws.organizationId))).limit(1)],
    ];
    for (const [field, q] of checks) {
      const v = body[field];
      if (typeof v !== "string") continue; // undefined (not sent) or null (clearing) are both fine
      if ((await q()).length === 0) return field;
    }
    return null;
  }

  /** Ensures the current user is a member of the org that owns the workspace. */
  async function loadWorkspace(c: any, workspaceId: string) {
    const db: Db = c.get("db");
    const userId: string = c.get("user").id;
    const [ws] = await db.select().from(workspace).where(eq(workspace.id, workspaceId)).limit(1);
    if (!ws) return null;
    const [m] = await db
      .select()
      .from(member)
      .where(and(eq(member.organizationId, ws.organizationId), eq(member.userId, userId)))
      .limit(1);
    return m ? ws : null;
  }

  // ------------------------------------------------------------------------
  // Workspaces
  // ------------------------------------------------------------------------
  app.get("/api/workspaces", async (c) => {
    const db = c.get("db");
    const userId = c.get("user")!.id;
    const rows = await db
      .select({ ws: workspace })
      .from(workspace)
      .innerJoin(member, and(eq(member.organizationId, workspace.organizationId), eq(member.userId, userId)));
    return c.json(rows.map((r) => r.ws));
  });

  const createWorkspaceBody = z.object({
    organizationId: z.string(),
    name: z.string().min(1).max(80),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    mode: z.string().default("knowledge"),
  });

  app.post("/api/workspaces", async (c) => {
    const db = c.get("db");
    const body = createWorkspaceBody.parse(await c.req.json());
    const userId = c.get("user")!.id;
    const [m] = await db
      .select()
      .from(member)
      .where(and(eq(member.organizationId, body.organizationId), eq(member.userId, userId)))
      .limit(1);
    if (!m) return c.json({ error: "not a member of that organization" }, 403);

    const profile = resolveMode(body.mode, {});
    const id = nanoid();
    await db.insert(workspace).values({ id, ...body });
    // Seed stages from the mode's defaults so the board is usable immediately.
    await db.insert(stage).values(
      profile.defaults.stages.map((s, i) => ({
        id: nanoid(),
        workspaceId: id,
        name: s.name,
        position: i + 1,
        isTerminal: !!s.terminal,
      })),
    );
    return c.json({ id }, 201);
  });

  /** Workspace plus its fully resolved mode profile. The client renders from this. */
  app.get("/api/workspaces/:id", async (c) => {
    const ws = await loadWorkspace(c, c.req.param("id"));
    if (!ws) return c.json({ error: "not found" }, 404);
    const db = c.get("db");
    const stages = await db.select().from(stage).where(eq(stage.workspaceId, ws.id)).orderBy(asc(stage.position));
    return c.json({ ...ws, profile: resolveMode(ws.mode, ws.modeOverrides ?? {}), stages });
  });

  app.patch("/api/workspaces/:id", async (c) => {
    const ws = await loadWorkspace(c, c.req.param("id"));
    if (!ws) return c.json({ error: "not found" }, 404);
    const body = z
      .object({ name: z.string().min(1).optional(), mode: z.string().optional(), modeOverrides: z.record(z.unknown()).optional() })
      .parse(await c.req.json());
    if (body.mode) resolveMode(body.mode, {}); // throws on unknown mode
    await c.get("db").update(workspace).set(body).where(eq(workspace.id, ws.id));
    return c.json({ ok: true });
  });

  // ------------------------------------------------------------------------
  // Items
  // ------------------------------------------------------------------------
  app.get("/api/workspaces/:id/items", async (c) => {
    const ws = await loadWorkspace(c, c.req.param("id"));
    if (!ws) return c.json({ error: "not found" }, 404);
    const rows = await c
      .get("db")
      .select()
      .from(item)
      .where(eq(item.workspaceId, ws.id))
      .orderBy(asc(item.stageId), asc(item.position));
    return c.json(rows);
  });

  const itemBody = z.object({
    title: z.string().min(1).max(300),
    description: z.string().optional(),
    stageId: z.string().optional(),
    containerId: z.string().nullable().optional(),
    cycleId: z.string().nullable().optional(),
    milestoneId: z.string().nullable().optional(),
    assigneeId: z.string().nullable().optional(),
    reviewerId: z.string().nullable().optional(),
    size: z.number().nullable().optional(),
    dueOn: z.string().date().nullable().optional(),
    references: z.array(z.object({ kind: z.string(), url: z.string().url(), label: z.string().optional() })).optional(),
    recurrence: z.string().nullable().optional(),
  });

  app.post("/api/workspaces/:id/items", async (c) => {
    const ws = await loadWorkspace(c, c.req.param("id"));
    if (!ws) return c.json({ error: "not found" }, 404);
    const db = c.get("db");
    const body = itemBody.parse(await c.req.json());
    const userId = c.get("user")!.id;
    const bad = await foreignRef(db, ws, body);
    if (bad) return c.json({ error: `${bad} not in this workspace` }, 400);

    const [{ n }] = await db.select({ n: max(item.number) }).from(item).where(eq(item.workspaceId, ws.id));
    let stageId = body.stageId;
    if (!stageId) {
      const [first] = await db.select().from(stage).where(eq(stage.workspaceId, ws.id)).orderBy(asc(stage.position)).limit(1);
      stageId = first?.id;
    }
    const [last] = await db
      .select({ p: item.position })
      .from(item)
      .where(and(eq(item.workspaceId, ws.id), eq(item.stageId, stageId ?? "")))
      .orderBy(desc(item.position))
      .limit(1);

    const id = nanoid();
    const values = {
      id,
      workspaceId: ws.id,
      number: (n ?? 0) + 1,
      creatorId: userId,
      position: (last?.p ?? 0) + 1000,
      ...body,
      stageId,
    };
    await db.batch([
      db.insert(item).values(values),
      db.insert(itemEvent).values({ id: nanoid(), workspaceId: ws.id, itemId: id, actorId: userId, kind: "created", after: { stageId, size: body.size ?? null } }),
    ]);
    return c.json({ id, number: values.number }, 201);
  });

  app.patch("/api/workspaces/:id/items/:itemId", async (c) => {
    const ws = await loadWorkspace(c, c.req.param("id"));
    if (!ws) return c.json({ error: "not found" }, 404);
    const db = c.get("db");
    const userId = c.get("user")!.id;
    const body = itemBody.partial().parse(await c.req.json());
    const [before] = await db.select().from(item).where(and(eq(item.id, c.req.param("itemId")), eq(item.workspaceId, ws.id))).limit(1);
    if (!before) return c.json({ error: "not found" }, 404);
    const bad = await foreignRef(db, ws, body);
    if (bad) return c.json({ error: `${bad} not in this workspace` }, 400);

    const events: Array<typeof itemEvent.$inferInsert> = [];
    const ev = (kind: string, key: keyof typeof before) => {
      if (key in body && (body as any)[key] !== before[key]) {
        events.push({ id: nanoid(), workspaceId: ws.id, itemId: before.id, actorId: userId, kind, before: { [key]: before[key] }, after: { [key]: (body as any)[key] } });
      }
    };
    ev("stage_changed", "stageId");
    ev("size_changed", "size");
    ev("cycle_changed", "cycleId");
    ev("container_changed", "containerId");

    // Closing is derived from the terminal flag on the stage, not from a mode.
    let closedAt = before.closedAt;
    if (body.stageId && body.stageId !== before.stageId) {
      const [st] = await db.select().from(stage).where(and(eq(stage.id, body.stageId), eq(stage.workspaceId, ws.id))).limit(1);
      if (!st) return c.json({ error: "stage not in this workspace" }, 400);
      const nowClosed = st.isTerminal;
      if (nowClosed && !closedAt) { closedAt = new Date(); events.push({ id: nanoid(), workspaceId: ws.id, itemId: before.id, actorId: userId, kind: "closed" }); }
      if (!nowClosed && closedAt) { closedAt = null; events.push({ id: nanoid(), workspaceId: ws.id, itemId: before.id, actorId: userId, kind: "reopened" }); }
    }

    await db.batch([
      db.update(item).set({ ...body, closedAt, updatedAt: new Date() }).where(eq(item.id, before.id)),
      ...(events.length ? [db.insert(itemEvent).values(events)] : []),
    ] as any);
    const [after] = await db.select().from(item).where(eq(item.id, before.id)).limit(1);
    return c.json(after);
  });

  /** Board move: change stage and/or position in one call. */
  app.post("/api/workspaces/:id/items/:itemId/move", async (c) => {
    const ws = await loadWorkspace(c, c.req.param("id"));
    if (!ws) return c.json({ error: "not found" }, 404);
    const db = c.get("db");
    const userId = c.get("user")!.id;
    const body = z.object({ stageId: z.string(), afterItemId: z.string().nullable().optional(), beforeItemId: z.string().nullable().optional() }).parse(await c.req.json());
    const [cur] = await db.select().from(item).where(and(eq(item.id, c.req.param("itemId")), eq(item.workspaceId, ws.id))).limit(1);
    if (!cur) return c.json({ error: "not found" }, 404);

    // Anchors must be items in this workspace; a foreign anchor is a 400, not a silent fallback.
    const pos = async (id?: string | null) => {
      if (!id) return undefined;
      const [row] = await db.select({ p: item.position }).from(item).where(and(eq(item.id, id), eq(item.workspaceId, ws.id))).limit(1);
      if (!row) throw new AnchorError();
      return row.p;
    };
    let a: number | undefined, b: number | undefined;
    try {
      a = await pos(body.afterItemId);
      b = await pos(body.beforeItemId);
    } catch (e) {
      if (e instanceof AnchorError) return c.json({ error: "anchor item not in this workspace" }, 400);
      throw e;
    }
    let position: number;
    if (a !== undefined && b !== undefined) position = (a + b) / 2;
    else if (a !== undefined) position = a + 1000;
    else if (b !== undefined) position = b - 1000;
    else position = 1000;

    const [st] = await db.select().from(stage).where(and(eq(stage.id, body.stageId), eq(stage.workspaceId, ws.id))).limit(1);
    if (!st) return c.json({ error: "stage not in this workspace" }, 400);
    const closedAt = st.isTerminal ? (cur.closedAt ?? new Date()) : null;
    const ops: any[] = [db.update(item).set({ stageId: body.stageId, position, closedAt, updatedAt: new Date() }).where(eq(item.id, cur.id))];
    if (body.stageId !== cur.stageId) {
      const ev = (kind: string, before?: Record<string, unknown>, after?: Record<string, unknown>) => ({ id: nanoid(), workspaceId: ws.id, itemId: cur.id, actorId: userId, kind, before, after });
      const events = [ev("stage_changed", { stageId: cur.stageId }, { stageId: body.stageId })];
      if (closedAt && !cur.closedAt) events.push(ev("closed"));
      if (!closedAt && cur.closedAt) events.push(ev("reopened"));
      ops.push(db.insert(itemEvent).values(events));
    }
    await db.batch(ops as any);
    const [after] = await db.select().from(item).where(eq(item.id, cur.id)).limit(1);
    return c.json(after);
  });

  // ------------------------------------------------------------------------
  // Stages, containers, cycles (thin CRUD; extend as needed)
  // ------------------------------------------------------------------------
  app.post("/api/workspaces/:id/stages", async (c) => {
    const ws = await loadWorkspace(c, c.req.param("id"));
    if (!ws) return c.json({ error: "not found" }, 404);
    const body = z.object({ name: z.string().min(1), isTerminal: z.boolean().optional() }).parse(await c.req.json());
    const db = c.get("db");
    const [{ m }] = await db.select({ m: max(stage.position) }).from(stage).where(eq(stage.workspaceId, ws.id));
    const id = nanoid();
    await db.insert(stage).values({ id, workspaceId: ws.id, name: body.name, position: (m ?? 0) + 1, isTerminal: !!body.isTerminal });
    return c.json({ id }, 201);
  });

  app.get("/api/workspaces/:id/containers", async (c) => {
    const ws = await loadWorkspace(c, c.req.param("id"));
    if (!ws) return c.json({ error: "not found" }, 404);
    return c.json(await c.get("db").select().from(container).where(eq(container.workspaceId, ws.id)));
  });

  app.post("/api/workspaces/:id/containers", async (c) => {
    const ws = await loadWorkspace(c, c.req.param("id"));
    if (!ws) return c.json({ error: "not found" }, 404);
    const body = z.object({ title: z.string().min(1), description: z.string().optional(), dueOn: z.string().date().nullable().optional() }).parse(await c.req.json());
    const id = nanoid();
    await c.get("db").insert(container).values({ id, workspaceId: ws.id, title: body.title, description: body.description, dueOn: body.dueOn ?? null });
    return c.json({ id }, 201);
  });

  app.get("/api/workspaces/:id/cycles", async (c) => {
    const ws = await loadWorkspace(c, c.req.param("id"));
    if (!ws) return c.json({ error: "not found" }, 404);
    return c.json(await c.get("db").select().from(cycle).where(eq(cycle.workspaceId, ws.id)).orderBy(desc(cycle.startsAt)));
  });

  app.post("/api/workspaces/:id/cycles", async (c) => {
    const ws = await loadWorkspace(c, c.req.param("id"));
    if (!ws) return c.json({ error: "not found" }, 404);
    const body = z.object({ name: z.string().min(1), startsAt: z.string().datetime(), endsAt: z.string().datetime() }).parse(await c.req.json());
    const id = nanoid();
    await c.get("db").insert(cycle).values({ id, workspaceId: ws.id, name: body.name, startsAt: new Date(body.startsAt), endsAt: new Date(body.endsAt) });
    return c.json({ id }, 201);
  });

  // ------------------------------------------------------------------------
  // Reports
  // ------------------------------------------------------------------------
  app.get("/api/workspaces/:id/reports", async (c) => {
    const ws = await loadWorkspace(c, c.req.param("id"));
    if (!ws) return c.json({ error: "not found" }, 404);
    const cycleId = c.req.query("cycleId") || null;
    return c.json(await buildReport(c.get("db"), ws.id, cycleId));
  });

  /**
   * HTTP cron for platforms without a scheduled handler. Vercel calls this
   * from vercel.json "crons" with Authorization: Bearer $CRON_SECRET.
   * Cloudflare uses the scheduled() export in entry.cloudflare.ts instead.
   */
  app.on(["GET", "POST"], "/api/cron/snapshots", async (c) => {
    const secret = c.env.CRON_SECRET;
    const auth = c.req.header("authorization") ?? "";
    if (!secret || auth !== `Bearer ${secret}`) return c.json({ error: "unauthorized" }, 401);
    const n = await snapshotAll(c.get("db"));
    return c.json({ ok: true, workspaces: n });
  });

  app.onError((err, c) => {
    if (err instanceof z.ZodError) return c.json({ error: "validation", issues: err.issues }, 400);
    console.error(err);
    return c.json({ error: "internal" }, 500);
  });

  return app;
}
