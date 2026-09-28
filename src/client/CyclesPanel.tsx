import { useEffect, useState } from "react";
import type { Cycle } from "./api";
import { useT } from "./mode";
import type { useCycles } from "./useCycles";

type Store = ReturnType<typeof useCycles>;
type Draft = Omit<Cycle, "id">;

/** Pull a readable message out of an API error body; fall back to the raw text. */
function apiMessage(e: unknown): string {
  const m = String((e as Error).message ?? e);
  const body = m.replace(/^\d{3}\s*/, "");
  try {
    const j = JSON.parse(body);
    if (j.issues?.length) return j.issues.map((i: any) => i.message).join("; ");
    if (typeof j.error === "string") return j.error;
  } catch {}
  return m;
}

/**
 * Manage cycles: create the next one with profile defaults, edit dates and
 * names inline, delete. Items in a deleted cycle are unassigned, not removed.
 *
 * Every row edits a local draft and saves on blur or Enter, never on each
 * keystroke: a date input fires change for every valid intermediate value
 * while the year is being typed, and saving those would persist year 0002.
 */
export function CyclesPanel({ store, onClose }: { store: Store; onClose: () => void }) {
  const t = useT();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setErr(null);
    try { await fn(); return true; } catch (e) { setErr(apiMessage(e)); return false; }
  };

  const startDraft = () => {
    const d = store.nextDefaults();
    setDraft({ ...d, name: `${t("cycle.one")} ${d.name}` });
  };

  return (
    <section className="cycles-panel">
      <header>
        <h2>{t("cycle.many")}</h2>
        <button onClick={startDraft} disabled={!!draft}>New {t("cycle.one").toLowerCase()}</button>
        <button className="link" onClick={onClose}>Close</button>
      </header>

      {draft && (
        <form
          className="cycle-row draft"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => { await store.create(draft); setDraft(null); });
          }}
        >
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required autoFocus />
          <input type="date" value={draft.startsOn} onChange={(e) => setDraft({ ...draft, startsOn: e.target.value })} required />
          <input type="date" value={draft.endsOn} onChange={(e) => setDraft({ ...draft, endsOn: e.target.value })} required min={draft.startsOn} />
          <button type="submit">Create</button>
          <button type="button" className="link" onClick={() => setDraft(null)}>Cancel</button>
        </form>
      )}

      {store.cycles.length === 0 && !draft && <p className="muted">No {t("cycle.many").toLowerCase()} yet.</p>}

      {store.cycles.map((c) => (
        <CycleRow
          key={c.id}
          cycle={c}
          active={store.active?.id === c.id}
          onSave={(b) => run(() => store.update(c.id, b))}
          onDelete={() => run(() => store.remove(c.id))}
        />
      ))}
      {err && <p className="error">{err}</p>}
    </section>
  );
}

function CycleRow({ cycle, active, onSave, onDelete }: { cycle: Cycle; active: boolean; onSave: (b: Partial<Draft>) => Promise<boolean>; onDelete: () => void }) {
  const t = useT();
  const [d, setD] = useState<Draft>({ name: cycle.name, startsOn: cycle.startsOn, endsOn: cycle.endsOn });
  const [confirm, setConfirm] = useState(false);

  // Follow external updates (a successful save returns the server row; a failed one resets).
  useEffect(() => { setD({ name: cycle.name, startsOn: cycle.startsOn, endsOn: cycle.endsOn }); }, [cycle.name, cycle.startsOn, cycle.endsOn]);

  const save = async (key: keyof Draft) => {
    const v = key === "name" ? d.name.trim() : d[key];
    if (!v || v === cycle[key]) { setD((x) => ({ ...x, [key]: cycle[key] })); return; }
    const ok = await onSave({ [key]: v });
    if (!ok) setD((x) => ({ ...x, [key]: cycle[key] }));
  };
  const onKey = (key: keyof Draft) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
    if (e.key === "Escape") setD((x) => ({ ...x, [key]: cycle[key] }));
  };

  return (
    <div className={`cycle-row ${active ? "active" : ""}`}>
      <input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} onBlur={() => save("name")} onKeyDown={onKey("name")} />
      <input type="date" value={d.startsOn} max={d.endsOn} onChange={(e) => setD({ ...d, startsOn: e.target.value })} onBlur={() => save("startsOn")} onKeyDown={onKey("startsOn")} />
      <input type="date" value={d.endsOn} min={d.startsOn} onChange={(e) => setD({ ...d, endsOn: e.target.value })} onBlur={() => save("endsOn")} onKeyDown={onKey("endsOn")} />
      {active ? <span className="pill">Current</span> : <span />}
      {confirm ? (
        <span className="row">
          <button className="danger" onClick={onDelete}>Delete {t("cycle.one").toLowerCase()}</button>
          <button className="link" onClick={() => setConfirm(false)}>Keep</button>
        </span>
      ) : (
        <button className="link" onClick={() => setConfirm(true)}>Delete</button>
      )}
    </div>
  );
}
