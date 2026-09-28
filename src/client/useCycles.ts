import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type Cycle } from "./api";
import { useMode } from "./mode";

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (ymd: string, n: number) => iso(new Date(Date.parse(ymd + "T00:00:00Z") + n * DAY));
/** Today's UTC date, the same key the server uses for active-cycle detection and snapshots. */
export const todayKey = () => iso(new Date());

/**
 * Cycle store for a workspace. Cycles change rarely, so this loads once and
 * updates from mutation responses rather than polling.
 */
export function useCycles(wsId: string) {
  const { defaults } = useMode();
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [loaded, setLoaded] = useState(false);
  const reload = useCallback(() => api.cycles(wsId).then((rows) => { setCycles(rows); setLoaded(true); }), [wsId]);
  useEffect(() => { reload(); }, [reload]);

  const byId = useMemo(() => new Map(cycles.map((c) => [c.id, c])), [cycles]);

  /** The cycle whose span contains today. Ties resolve to the one that started most recently. */
  const active = useMemo(() => {
    const t = todayKey();
    return cycles.filter((c) => c.startsOn <= t && c.endsOn >= t).sort((a, b) => (a.startsOn < b.startsOn ? 1 : -1))[0] ?? null;
  }, [cycles]);

  /** Sensible defaults for the next cycle: day after the latest one ends, or today; profile length. */
  const nextDefaults = useCallback((): Omit<Cycle, "id"> => {
    const latest = [...cycles].sort((a, b) => (a.endsOn < b.endsOn ? 1 : -1))[0];
    const startsOn = latest ? addDays(latest.endsOn, 1) : todayKey();
    const n = cycles.length + 1;
    return { name: `${n}`, startsOn, endsOn: addDays(startsOn, defaults.cycleLengthDays - 1) };
  }, [cycles, defaults.cycleLengthDays]);

  const create = useCallback(async (body: Omit<Cycle, "id">) => {
    const row = await api.createCycle(wsId, body);
    setCycles((prev) => [row, ...prev].sort((a, b) => (a.startsOn < b.startsOn ? 1 : -1)));
    return row;
  }, [wsId]);

  const update = useCallback(async (id: string, body: Partial<Omit<Cycle, "id">>) => {
    const row = await api.updateCycle(wsId, id, body);
    setCycles((prev) => prev.map((c) => (c.id === id ? row : c)).sort((a, b) => (a.startsOn < b.startsOn ? 1 : -1)));
    return row;
  }, [wsId]);

  const remove = useCallback(async (id: string) => {
    await api.deleteCycle(wsId, id);
    setCycles((prev) => prev.filter((c) => c.id !== id));
  }, [wsId]);

  return { cycles, loaded, byId, active, nextDefaults, create, update, remove, reload };
}
