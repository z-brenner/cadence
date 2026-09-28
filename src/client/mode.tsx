import { createContext, useContext, type ReactNode } from "react";
import type { ModeProfile, Terminology } from "@modes/schema";

/**
 * The only way the UI learns what to call things or what to show.
 * Rule enforced in review: no user-facing string literal in JSX outside t(),
 * and no `profile.id === "technical"` anywhere in the client. Ask the
 * features object instead.
 */
const ModeContext = createContext<ModeProfile | null>(null);

export function ModeProvider({ profile, children }: { profile: ModeProfile; children: ReactNode }) {
  return <ModeContext.Provider value={profile}>{children}</ModeContext.Provider>;
}

export function useMode(): ModeProfile {
  const p = useContext(ModeContext);
  if (!p) throw new Error("useMode must be used inside ModeProvider");
  return p;
}

type Leaf = string;
type Path<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends Leaf ? `${P}${K}` : Path<T[K], `${P}${K}.`>;
}[keyof T & string];

export type TermKey = Path<Terminology>;

/** t("item.one") -> "Issue" | "Task" depending on the workspace's mode. */
export function useT() {
  const { terminology } = useMode();
  return (key: TermKey): string => {
    let cur: unknown = terminology;
    for (const part of key.split(".")) cur = (cur as Record<string, unknown>)?.[part];
    if (typeof cur !== "string") throw new Error(`missing terminology key: ${key}`);
    return cur;
  };
}

/** Format a stored numeric size according to the mode's scale. */
export function useSizeFormatter() {
  const { defaults } = useMode();
  return (size: number | null | undefined): string => {
    if (size == null) return "";
    const s = defaults.sizeScale;
    if (s.kind === "tshirt") {
      const hit = s.values.find((v) => v.value === size) ?? s.values.reduce((a, b) => (Math.abs(b.value - size) < Math.abs(a.value - size) ? b : a));
      return hit.label;
    }
    if (s.kind === "hours") return `${size}h`;
    return String(size);
  };
}

/** Options for a size picker, always [label, storedNumber]. */
export function useSizeOptions(): Array<[string, number]> {
  const { defaults } = useMode();
  const s = defaults.sizeScale;
  if (s.kind === "tshirt") return s.values.map((v) => [v.label, v.value]);
  if (s.kind === "points") return s.values.map((v) => [String(v), v]);
  return Array.from({ length: 16 }, (_, i) => (i + 1) * s.step).map((h) => [`${h}h`, h]);
}
