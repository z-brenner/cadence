import { useState } from "react";
import type { Cycle } from "./api";
import { useT } from "./mode";
import type { useCycles } from "./useCycles";

type Store = ReturnType<typeof useCycles>;

/**
 * Manage cycles: create the next one with profile defaults, edit dates and
 * names inline, delete. Items in a deleted cycle are unassigned, not removed.
 */
export function CyclesPanel({ store, onClose }: { store: Store; onClose: () => void }) {
  const t = useT();
  const [draft, setDraft] = useState<Omit<Cycle, "id"> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setErr(null);
    try { await fn(); } catch (e) { setErr(String((e as Error).message ?? e)); }
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
        <CycleRow key={c.id} cycle={c} active={store.active?.id === c.id} onChange={(b) => run(() => store.update(c.id, b))} onDelete={() => run(() => store.remove(c.id))} />
      ))}
      {err && <p className="error">{err}</p>}
    </section>
  );
}

function CycleRow({ cycle, active, onChange, onDelete }: { cycle: Cycle; active: boolean; onChange: (b: Partial<Omit<Cycle, "id">>) => void; onDelete: () => void }) {
  const t = useT();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className={`cycle-row ${active ? "active" : ""}`}>
      <input defaultValue={cycle.name} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== cycle.name) onChange({ name: v }); }} />
      <input type="date" value={cycle.startsOn} max={cycle.endsOn} onChange={(e) => e.target.value && onChange({ startsOn: e.target.value })} />
      <input type="date" value={cycle.endsOn} min={cycle.startsOn} onChange={(e) => e.target.value && onChange({ endsOn: e.target.value })} />
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
