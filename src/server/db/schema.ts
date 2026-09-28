/**
 * Single schema for both modes. Entity names are mode-neutral on purpose:
 * item, container, cycle, stage, milestone. The mode profile decides what the
 * user sees them called. Nothing in this file may depend on workspace mode.
 */
import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  real,
  jsonb,
  index,
  uniqueIndex,
  unique,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Better Auth tables (core + organization plugin). Do not rename columns; the
// adapter expects these names.
// ---------------------------------------------------------------------------

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  activeOrganizationId: text("active_organization_id"),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const organization = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").unique(),
  logo: text("logo"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  metadata: text("metadata"),
});

export const member = pgTable("member", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const invitation = pgTable("invitation", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role"),
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at").notNull(),
  inviterId: text("inviter_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Application tables
// ---------------------------------------------------------------------------

/** A workspace belongs to an organization and carries exactly one mode. */
export const workspace = pgTable(
  "workspace",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    /** "technical" | "knowledge" | any profile id found in /modes */
    mode: text("mode").notNull().default("knowledge"),
    /** Per-workspace overrides merged on top of the mode profile. */
    modeOverrides: jsonb("mode_overrides").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("workspace_org_slug").on(t.organizationId, t.slug)],
);

/** Ordered columns on the board. "Pipeline" in technical mode, "Stage" in knowledge mode. */
export const stage = pgTable(
  "stage",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: real("position").notNull(),
    /** Items in a terminal stage count as done for reporting. */
    isTerminal: boolean("is_terminal").notNull().default(false),
  },
  (t) => [index("stage_workspace").on(t.workspaceId)],
);

/** Groups of items. "Epic" in technical mode, "Project" in knowledge mode. */
export const container = pgTable(
  "container",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").notNull().default("open"),
    dueAt: timestamp("due_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("container_workspace").on(t.workspaceId)],
);

/** Time-boxed period. "Sprint" in technical mode, "Cycle" or "Week" in knowledge mode. */
export const cycle = pgTable(
  "cycle",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    startsAt: timestamp("starts_at").notNull(),
    endsAt: timestamp("ends_at").notNull(),
  },
  (t) => [index("cycle_workspace").on(t.workspaceId)],
);

/** Dated target. "Release" in technical mode, "Deadline" in knowledge mode. */
export const milestone = pgTable(
  "milestone",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    dueAt: timestamp("due_at"),
  },
  (t) => [index("milestone_workspace").on(t.workspaceId)],
);

/** The unit of work. "Issue" in technical mode, "Task" in knowledge mode. */
export const item = pgTable(
  "item",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    /** Human-facing sequential number, unique per workspace. */
    number: integer("number").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    stageId: text("stage_id").references(() => stage.id, { onDelete: "set null" }),
    /** Fractional ordering within a stage; reindex when gaps get small. */
    position: real("position").notNull().default(0),
    containerId: text("container_id").references(() => container.id, { onDelete: "set null" }),
    cycleId: text("cycle_id").references(() => cycle.id, { onDelete: "set null" }),
    milestoneId: text("milestone_id").references(() => milestone.id, { onDelete: "set null" }),
    assigneeId: text("assignee_id").references(() => user.id, { onDelete: "set null" }),
    creatorId: text("creator_id").references(() => user.id, { onDelete: "set null" }),
    /**
     * Always stored as a number. Technical mode shows it as points, knowledge
     * mode maps it to S/M/L via the profile's sizeScale. Reports use the number.
     */
    size: real("size"),
    dueAt: timestamp("due_at"),
    /** Named reviewer or approver. Prominent in knowledge mode, hidden by default in technical mode. */
    reviewerId: text("reviewer_id").references(() => user.id, { onDelete: "set null" }),
    /** Free-form external references (branch, PR URL, doc link). Rendered per mode. */
    references: jsonb("references").$type<Array<{ kind: string; url: string; label?: string }>>().default([]),
    /** iCal-style RRULE string. Knowledge mode feature; harmless elsewhere. */
    recurrence: text("recurrence"),
    closedAt: timestamp("closed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("item_workspace_number").on(t.workspaceId, t.number),
    index("item_stage_position").on(t.stageId, t.position),
    index("item_container").on(t.containerId),
    index("item_cycle").on(t.cycleId),
  ],
);

export const label = pgTable(
  "label",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("#888888"),
  },
  (t) => [uniqueIndex("label_workspace_name").on(t.workspaceId, t.name)],
);

export const itemLabel = pgTable(
  "item_label",
  {
    itemId: text("item_id").notNull().references(() => item.id, { onDelete: "cascade" }),
    labelId: text("label_id").notNull().references(() => label.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("item_label_pk").on(t.itemId, t.labelId)],
);

/** Directed dependency. "Blocked by" in technical mode, "Waiting on" in knowledge mode. */
export const dependency = pgTable(
  "dependency",
  {
    id: text("id").primaryKey(),
    /** The item that cannot proceed. */
    itemId: text("item_id").notNull().references(() => item.id, { onDelete: "cascade" }),
    /** The item it is waiting on. */
    dependsOnId: text("depends_on_id").notNull().references(() => item.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("dependency_pair").on(t.itemId, t.dependsOnId)],
);

export const comment = pgTable(
  "comment",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id").notNull().references(() => item.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("comment_item").on(t.itemId)],
);

/**
 * Append-only log of every state transition. Reports (burndown, throughput,
 * cumulative flow) are computed from this, so it must be written from day one.
 * Capture history now or you can never backfill it.
 */
export const itemEvent = pgTable(
  "item_event",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    itemId: text("item_id").notNull().references(() => item.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    /** "created" | "stage_changed" | "size_changed" | "cycle_changed" | "closed" | "reopened" | ... */
    kind: text("kind").notNull(),
    before: jsonb("before").$type<Record<string, unknown>>(),
    after: jsonb("after").$type<Record<string, unknown>>(),
    at: timestamp("at").notNull().defaultNow(),
  },
  (t) => [index("item_event_workspace_at").on(t.workspaceId, t.at), index("item_event_item").on(t.itemId)],
);

/**
 * Materialized daily snapshot per workspace and cycle. Written by a nightly
 * job (or lazily on first read of the day) so Workers never compute reports
 * over the full event log inside a request.
 */
export const dailySnapshot = pgTable(
  "daily_snapshot",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    cycleId: text("cycle_id").references(() => cycle.id, { onDelete: "cascade" }),
    day: text("day").notNull(), // YYYY-MM-DD
    /** { stageId: { count, size } } */
    byStage: jsonb("by_stage").$type<Record<string, { count: number; size: number }>>().notNull(),
    openSize: real("open_size").notNull(),
    closedSize: real("closed_size").notNull(),
  },
  (t) => [unique("snapshot_ws_cycle_day").on(t.workspaceId, t.cycleId, t.day).nullsNotDistinct()],
);
