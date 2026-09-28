import { useMemo, useState } from "react";
import type { Cycle, Item, Workspace } from "./api";
import { CycleField, DueField, References, SizeField, useVisibleFields } from "./fields";
import { useT } from "./mode";

type Props = {
  ws: Workspace;
  items: Item[];
  cycles: Cycle[];
  patch: (itemId: string, body: Partial<Item>) => void;
};

type SortKey = "number" | "title" | "stage" | "size" | "dueOn";

export function ListView({ ws, items, cycles, patch }: Props) {
  const t = useT();
  const show = useVisibleFields();
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "number", dir: 1 });
  const [hideDone, setHideDone] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const stageOrder = useMemo(() => new Map(ws.stages.map((s, i) => [s.id, i])), [ws.stages]);
  const stageName = useMemo(() => new Map(ws.stages.map((s) => [s.id, s.name])), [ws.stages]);

  const rows = useMemo(() => {
    const filtered = hideDone ? items.filter((i) => !i.closedAt) : items;
    const val = (i: Item): number | string => {
      switch (sort.key) {
        case "number": return i.number;
        case "title": return i.title.toLowerCase();
        case "stage": return stageOrder.get(i.stageId ?? "") ?? 999;
        case "size": return i.size ?? -1;
        case "dueOn": return i.dueOn ?? "9999-99-99";
      }
    };
    return [...filtered].sort((a, b) => {
      const x = val(a), y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [items, sort, hideDone, stageOrder]);

  const th = (key: SortKey, label: string) => (
    <th onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))} className="sortable">
      {label}
      {sort.key === key && <span className="muted">{sort.dir === 1 ? " ↑" : " ↓"}</span>}
    </th>
  );

  function commitTitle(it: Item) {
    const v = draft.trim();
    if (v && v !== it.title) patch(it.id, { title: v });
    setEditing(null);
  }

  return (
    <div className="list">
      <div className="list-toolbar">
        <label>
          <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} /> Hide completed
        </label>
        <span className="muted">{rows.length} {t(rows.length === 1 ? "item.one" : "item.many").toLowerCase()}</span>
      </div>
      <table>
        <thead>
          <tr>
            {show.number && th("number", "#")}
            {th("title", t("item.one"))}
            {th("stage", t("stage.one"))}
            {show.size && th("size", t("size.one"))}
            {show.dueOn && th("dueOn", t("dueDate"))}
            {show.cycle && <th>{t("cycle.one")}</th>}
            {show.references && <th>{t("references")}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((it) => (
            <tr key={it.id} className={it.closedAt ? "done" : ""}>
              {show.number && <td className="num">{it.number}</td>}
              <td onDoubleClick={() => { setEditing(it.id); setDraft(it.title); }}>
                {editing === it.id ? (
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => commitTitle(it)}
                    onKeyDown={(e) => { if (e.key === "Enter") commitTitle(it); if (e.key === "Escape") setEditing(null); }}
                  />
                ) : (
                  it.title
                )}
              </td>
              <td>
                <select value={it.stageId ?? ""} onChange={(e) => patch(it.id, { stageId: e.target.value })}>
                  {ws.stages.map((s) => (
                    <option key={s.id} value={s.id}>{stageName.get(s.id)}</option>
                  ))}
                </select>
              </td>
              {show.size && <td><SizeField item={it} patch={patch} /></td>}
              {show.dueOn && <td><DueField item={it} patch={patch} /></td>}
              {show.cycle && <td><CycleField item={it} cycles={cycles} patch={patch} /></td>}
              {show.references && <td><References item={it} /></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
