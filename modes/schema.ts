/**
 * A mode profile is pure presentation config. It may rename things, hide
 * things, and set defaults. It may never change what the API stores or accepts.
 * If you find yourself wanting `if (mode === ...)` in src/server/db or in a
 * mutation, the thing you want is a new field on this schema instead.
 */
import { z } from "zod";

export const TerminologySchema = z.object({
  item: z.object({ one: z.string(), many: z.string() }),
  container: z.object({ one: z.string(), many: z.string() }),
  cycle: z.object({ one: z.string(), many: z.string() }),
  stage: z.object({ one: z.string(), many: z.string() }),
  milestone: z.object({ one: z.string(), many: z.string() }),
  /** Label for an item's own due date. Distinct from milestone, which is a shared dated target. */
  dueDate: z.string(),
  size: z.object({ one: z.string(), many: z.string() }),
  dependency: z.object({ blockedBy: z.string(), blocks: z.string() }),
  reviewer: z.string(),
  references: z.string(),
  reports: z.object({ progress: z.string(), throughput: z.string(), flow: z.string() }),
  actions: z.object({ create: z.string(), close: z.string(), reopen: z.string() }),
});

export const FeaturesSchema = z.object({
  /** Show branch / PR / commit style references on items. */
  codeReferences: z.boolean(),
  /** Show a named reviewer or approver field. */
  reviewer: z.boolean(),
  /** Allow items to repeat on a schedule. */
  recurrence: z.boolean(),
  /** Show due dates on cards. */
  dueDates: z.boolean(),
  /** Show sizing on cards and in reports. */
  sizing: z.boolean(),
  /** Reports section: which charts exist. */
  charts: z.object({ progress: z.boolean(), throughput: z.boolean(), flow: z.boolean() }),
  /** Which views are offered and in what order. First is default. */
  views: z.array(z.enum(["board", "list", "calendar", "timeline"])).min(1),
  /** Render descriptions as code-friendly markdown (monospace fences prominent). */
  codeMarkdown: z.boolean(),
});

/** Sizing always stores a number. The scale only decides how it is shown and picked. */
export const SizeScaleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("points"), values: z.array(z.number()) }),
  z.object({ kind: z.literal("tshirt"), values: z.array(z.object({ label: z.string(), value: z.number() })) }),
  z.object({ kind: z.literal("hours"), step: z.number().positive() }),
]);

export const DefaultsSchema = z.object({
  stages: z.array(z.object({ name: z.string(), terminal: z.boolean().optional() })).min(1),
  sizeScale: SizeScaleSchema,
  cycleLengthDays: z.number().int().positive(),
  /** Fields shown on a board card, in order. */
  cardFields: z.array(z.enum(["number", "assignee", "reviewer", "size", "dueOn", "cycle", "container", "labels", "references"])),
});

export const ModeProfileSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  description: z.string(),
  terminology: TerminologySchema,
  features: FeaturesSchema,
  defaults: DefaultsSchema,
});

export type ModeProfile = z.infer<typeof ModeProfileSchema>;
export type Terminology = z.infer<typeof TerminologySchema>;
export type Features = z.infer<typeof FeaturesSchema>;
