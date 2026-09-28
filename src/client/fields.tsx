import type { Item } from "./api";
import { useMode, useSizeOptions, useT } from "./mode";

type Patch = (itemId: string, body: Partial<Item>) => void;

/** Size picker. Stores the numeric value; shows the mode's labels. */
export function SizeField({ item, patch }: { item: Item; patch: Patch }) {
  const t = useT();
  const options = useSizeOptions();
  return (
    <select
      value={item.size ?? ""}
      onChange={(e) => patch(item.id, { size: e.target.value === "" ? null : Number(e.target.value) })}
      title={t("size.one")}
    >
      <option value="">{t("size.one")}</option>
      {options.map(([label, value]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
}

/** Due dates are calendar dates (YYYY-MM-DD); no time zone conversion anywhere. */
export function DueField({ item, patch }: { item: Item; patch: Patch }) {
  return <input type="date" value={item.dueOn ?? ""} onChange={(e) => patch(item.id, { dueOn: e.target.value || null })} />;
}

export function References({ item }: { item: Item }) {
  const t = useT();
  if (!item.references?.length) return null;
  return (
    <span className="refs" title={t("references")}>
      {item.references.map((r) => (
        <a key={r.url} href={r.url} target="_blank" rel="noreferrer">
          {r.label ?? r.kind}
        </a>
      ))}
    </span>
  );
}

/** Which optional fields this mode wants visible, resolved once per render. */
export function useVisibleFields() {
  const { features, defaults } = useMode();
  const on = (f: (typeof defaults.cardFields)[number]) => defaults.cardFields.includes(f);
  return {
    number: on("number"),
    size: features.sizing && on("size"),
    dueOn: features.dueDates && on("dueOn"),
    references: features.codeReferences && on("references"),
    reviewer: features.reviewer && on("reviewer"),
  };
}
