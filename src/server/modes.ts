import { ModeProfileSchema, type ModeProfile } from "@modes/schema";
import technical from "@modes/technical.json";
import knowledge from "@modes/knowledge.json";

/**
 * Built-in profiles are bundled at build time. To add a mode, drop a JSON file
 * in /modes and import it here. Validation runs once at module load so a bad
 * profile fails the deploy, not a request.
 */
const registry: Record<string, ModeProfile> = Object.fromEntries(
  [technical, knowledge].map((raw) => {
    const p = ModeProfileSchema.parse(raw);
    return [p.id, p];
  }),
);

export function listModes() {
  return Object.values(registry).map(({ id, name, description }) => ({ id, name, description }));
}

/** Deep-merge overrides onto the base profile, then re-validate so overrides cannot break the contract. */
export function resolveMode(id: string, overrides: Record<string, unknown>): ModeProfile {
  const base = registry[id];
  if (!base) throw new Error(`unknown mode: ${id}`);
  return ModeProfileSchema.parse(deepMerge(base, overrides));
}

function deepMerge<T>(base: T, patch: unknown): T {
  if (!isObj(base) || !isObj(patch)) return (patch === undefined ? base : (patch as T));
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch)) out[k] = deepMerge(out[k], v);
  return out as T;
}
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
