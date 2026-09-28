import { useMemo, useState, type DragEvent } from "react";
import type { Item } from "./api";
import { useT } from "./mode";

type Props = {
  items: Item[];
  patch: (itemId: string, body: Partial<Item>) => void;
};

const DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");
/** Local-date key, YYYY-MM-DD, so items land on the day the user sees. */
const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * Month grid keyed on dueAt. Dropping a card on a day sets its due date;
 * the API stores a UTC instant at local noon so the date survives time zones.
 */
export function CalendarView({ items, patch }: Props) {
  const t = useT();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const { cells, label } = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(first.getTime() - first.getDay() * DAY);
    const cells = Array.from({ length: 42 }, (_, i) => new Date(start.getTime() + i * DAY));
    const label = first.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    return { cells, label };
  }, [cursor]);

  const byDay = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const it of items) {
      if (!it.dueAt) continue;
      const k = key(new Date(it.dueAt));
      (m.get(k) ?? m.set(k, []).get(k)!).push(it);
    }
    return m;
  }, [items]);

  const undated = useMemo(() => items.filter((i) => !i.dueAt && !i.closedAt), [items]);
  const today = key(new Date());

  function onDrop(e: DragEvent, day: Date | null) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    const dueAt = day ? new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12).toISOString() : null;
    patch(id, { dueAt });
  }

  const card = (it: Item) => (
    <div
      key={it.id}
      className={`cal-item ${it.closedAt ? "done" : ""}`}
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", it.id)}
      title={it.title}
    >
      {it.title}
    </div>
  );

  return (
    <div className="calendar">
      <div className="cal-toolbar">
        <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>‹</button>
        <strong>{label}</strong>
        <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>›</button>
        <button className="link" onClick={() => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); }}>
          Today
        </button>
      </div>
      <div className="cal-grid">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="cal-dow">{d}</div>
        ))}
        {cells.map((d) => {
          const k = key(d);
          const inMonth = d.getMonth() === cursor.getMonth();
          return (
            <div
              key={k}
              className={`cal-cell ${inMonth ? "" : "outside"} ${k === today ? "today" : ""}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDrop(e, d)}
            >
              <div className="cal-date">{d.getDate()}</div>
              {(byDay.get(k) ?? []).map(card)}
            </div>
          );
        })}
      </div>
      <section className="cal-undated" onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop(e, null)}>
        <header>
          <span>No {t("milestone.one").toLowerCase()}</span>
          <span className="count">{undated.length}</span>
        </header>
        <div className="cal-undated-items">{undated.map(card)}</div>
      </section>
    </div>
  );
}
