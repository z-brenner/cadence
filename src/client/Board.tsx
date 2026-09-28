import { useEffect, useMemo, useState, type DragEvent } from "react";
import { api, type Item, type Workspace } from "./api";
import { useMode, useSizeFormatter, useSizeOptions, useT } from "./mode";

/**
 * Board renders entirely from the resolved profile. Native HTML5 drag and drop
 * keeps the dependency list short; swap in dnd-kit if you need touch support.
 */
export function Board({ ws }: { ws: Workspace }) {
  const t = useT();
  const { features, defaults } = useMode();
  const fmtSize = useSizeFormatter();
  const sizeOptions = useSizeOptions();
  const [items, setItems] = useState<Item[]>([]);
  const [draft, setDraft] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);

  const reload = () => api.items(ws.id).then(setItems);
  useEffect(() => {
    reload();
    // Baseline realtime: poll. Replace with a RealtimeAdapter when needed.
    const id = setInterval(reload, 4000);
    return () => clearInterval(id);
  }, [ws.id]);

  const byStage = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const s of ws.stages) m.set(s.id, []);
    for (const it of items) if (it.stageId && m.has(it.stageId)) m.get(it.stageId)!.push(it);
    for (const arr of m.values()) arr.sort((a, b) => a.position - b.position);
    return m;
  }, [items, ws.stages]);

  async function create() {
    if (!draft.trim()) return;
    await api.createItem(ws.id, { title: draft.trim() });
    setDraft("");
    reload();
  }

  function onDrop(e: DragEvent, stageId: string) {
    e.preventDefault();
    const itemId = dragging ?? e.dataTransfer.getData("text/plain");
    if (!itemId) return;
    const col = byStage.get(stageId) ?? [];
    const last = col.filter((i) => i.id !== itemId).at(-1);
    // Optimistic update, then persist.
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, stageId, position: (last?.position ?? 0) + 1000 } : i)));
    api.moveItem(ws.id, itemId, { stageId, afterItemId: last?.id ?? null }).catch(reload);
    setDragging(null);
  }

  return (
    <div className="board">
      <form
        className="new-item"
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t("actions.create")} />
        <button type="submit">{t("actions.create")}</button>
      </form>

      <div className="columns">
        {ws.stages.map((s) => (
          <section key={s.id} className="column" onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop(e, s.id)}>
            <header>
              <span>{s.name}</span>
              <span className="count">{byStage.get(s.id)?.length ?? 0}</span>
            </header>
            {(byStage.get(s.id) ?? []).map((it) => (
              <article
                key={it.id}
                className="card"
                draggable
                onDragStart={(e) => {
                  setDragging(it.id);
                  e.dataTransfer.setData("text/plain", it.id);
                }}
              >
                <div className="title">
                  {defaults.cardFields.includes("number") && <span className="num">#{it.number}</span>}
                  {it.title}
                </div>
                <div className="meta">
                  {features.sizing && defaults.cardFields.includes("size") && (
                    <select
                      value={it.size ?? ""}
                      onChange={(e) => {
                        const v = e.target.value === "" ? null : Number(e.target.value);
                        setItems((p) => p.map((x) => (x.id === it.id ? { ...x, size: v } : x)));
                        api.updateItem(ws.id, it.id, { size: v });
                      }}
                      title={t("size.one")}
                    >
                      <option value="">{t("size.one")}</option>
                      {sizeOptions.map(([label, value]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  )}
                  {features.dueDates && defaults.cardFields.includes("dueAt") && (
                    <input
                      type="date"
                      value={it.dueAt ? it.dueAt.slice(0, 10) : ""}
                      onChange={(e) => {
                        const v = e.target.value ? new Date(e.target.value).toISOString() : null;
                        setItems((p) => p.map((x) => (x.id === it.id ? { ...x, dueAt: v } : x)));
                        api.updateItem(ws.id, it.id, { dueAt: v });
                      }}
                    />
                  )}
                  {features.codeReferences && defaults.cardFields.includes("references") && it.references?.length > 0 && (
                    <span className="refs" title={t("references")}>
                      {it.references.map((r) => (
                        <a key={r.url} href={r.url} target="_blank" rel="noreferrer">
                          {r.label ?? r.kind}
                        </a>
                      ))}
                    </span>
                  )}
                  {features.sizing && it.size != null && !defaults.cardFields.includes("size") && <span>{fmtSize(it.size)}</span>}
                </div>
              </article>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
