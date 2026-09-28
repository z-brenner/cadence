import { useMemo, useState, type DragEvent } from "react";
import type { Item, Workspace } from "./api";
import { DueField, References, SizeField, useVisibleFields } from "./fields";

type Props = {
  ws: Workspace;
  items: Item[];
  patch: (itemId: string, body: Partial<Item>) => void;
  move: (itemId: string, body: { stageId: string; afterItemId?: string | null }, optimistic: Partial<Item>) => void;
};

/**
 * Board renders entirely from the resolved profile. Native HTML5 drag and drop
 * keeps the dependency list short; swap in dnd-kit if you need touch support.
 */
export function Board({ ws, items, patch, move }: Props) {
  const show = useVisibleFields();
  const [dragging, setDragging] = useState<string | null>(null);

  const byStage = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const s of ws.stages) m.set(s.id, []);
    for (const it of items) if (it.stageId && m.has(it.stageId)) m.get(it.stageId)!.push(it);
    for (const arr of m.values()) arr.sort((a, b) => a.position - b.position);
    return m;
  }, [items, ws.stages]);

  function onDrop(e: DragEvent, stageId: string) {
    e.preventDefault();
    const itemId = dragging ?? e.dataTransfer.getData("text/plain");
    if (!itemId) return;
    const col = byStage.get(stageId) ?? [];
    const last = col.filter((i) => i.id !== itemId).at(-1);
    move(itemId, { stageId, afterItemId: last?.id ?? null }, { stageId, position: (last?.position ?? 0) + 1000 });
    setDragging(null);
  }

  return (
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
                {show.number && <span className="num">#{it.number}</span>}
                {it.title}
              </div>
              <div className="meta">
                {show.size && <SizeField item={it} patch={patch} />}
                {show.dueAt && <DueField item={it} patch={patch} />}
                {show.references && <References item={it} />}
              </div>
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}
