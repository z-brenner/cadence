import { useId, useMemo, useState } from "react";

/**
 * Minimal SVG charts. No dependency, two chart forms, one hover layer.
 * Colors come from CSS custom properties defined in styles.css (--series-1..8),
 * assigned to series in fixed order and never cycled. More than 8 series folds
 * into "Other".
 */

export type Series = { name: string; values: number[] };

const W = 640, H = 220, PAD = { t: 12, r: 12, b: 28, l: 40 };
const MAX_SERIES = 8;

function foldSeries(series: Series[]): Series[] {
  if (series.length <= MAX_SERIES) return series;
  const keep = series.slice(0, MAX_SERIES - 1);
  const rest = series.slice(MAX_SERIES - 1);
  const other = { name: "Other", values: rest[0].values.map((_, i) => rest.reduce((s, r) => s + (r.values[i] ?? 0), 0)) };
  return [...keep, other];
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

function useScales(labels: string[], max: number) {
  const x = (i: number) => PAD.l + (labels.length <= 1 ? 0 : (i / (labels.length - 1)) * (W - PAD.l - PAD.r));
  const y = (v: number) => H - PAD.b - (v / max) * (H - PAD.t - PAD.b);
  return { x, y };
}

function Axes({ labels, max, y }: { labels: string[]; max: number; y: (v: number) => number }) {
  const ticks = [0, max / 2, max];
  const shown = labels.length <= 8 ? labels.map((l, i) => i) : [0, Math.floor(labels.length / 2), labels.length - 1];
  const xOf = (i: number) => PAD.l + (labels.length <= 1 ? 0 : (i / (labels.length - 1)) * (W - PAD.l - PAD.r));
  return (
    <g className="axes">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="grid" />
          <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end" className="tick">{Math.round(t)}</text>
        </g>
      ))}
      {shown.map((i) => (
        <text key={i} x={xOf(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === labels.length - 1 ? "end" : "middle"} className="tick">
          {labels[i]}
        </text>
      ))}
    </g>
  );
}

function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <div className="legend">
      {series.map((s, i) => (
        <span key={s.name}><i style={{ background: `var(--series-${i + 1})` }} />{s.name}</span>
      ))}
    </div>
  );
}

function Tooltip({ x, label, rows }: { x: number; label: string; rows: Array<{ name: string; value: number; slot: number }> }) {
  const left = x > W * 0.6 ? x - 8 : x + 8;
  return (
    <foreignObject x={Math.max(0, Math.min(W - 160, left - (x > W * 0.6 ? 150 : 0)))} y={PAD.t} width={160} height={H - PAD.t - PAD.b}>
      <div className="tooltip">
        <div className="tooltip-label">{label}</div>
        {rows.map((r) => (
          <div key={r.name} className="tooltip-row"><i style={{ background: `var(--series-${r.slot})` }} />{r.name}<b>{Math.round(r.value * 10) / 10}</b></div>
        ))}
      </div>
    </foreignObject>
  );
}

/** Multi-series line chart; `stacked` turns it into a stacked area. */
export function LineChart({ title, labels, series: raw, stacked = false, empty }: { title: string; labels: string[]; series: Series[]; stacked?: boolean; empty?: string }) {
  const id = useId();
  const series = useMemo(() => foldSeries(raw), [raw]);
  const [hover, setHover] = useState<number | null>(null);

  const stacks = useMemo(() => {
    if (!stacked) return series.map((s) => s.values.map((v) => [0, v] as [number, number]));
    const acc = labels.map(() => 0);
    return series.map((s) => s.values.map((v, i) => { const lo = acc[i]; acc[i] += v; return [lo, acc[i]] as [number, number]; }));
  }, [series, stacked, labels]);

  const max = niceMax(Math.max(0, ...stacks.flat().map(([, hi]) => hi)));
  const { x, y } = useScales(labels, max);

  if (!labels.length || !series.length) return <Figure title={title}><p className="muted">{empty ?? "No data yet."}</p></Figure>;

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (labels.length - 1));
    setHover(Math.max(0, Math.min(labels.length - 1, i)));
  };

  return (
    <Figure title={title}>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-labelledby={id}>
        <title id={id}>{title}</title>
        <Axes labels={labels} max={max} y={y} />
        {stacks.map((st, si) => {
          const top = st.map(([, hi], i) => `${x(i)},${y(hi)}`).join(" ");
          const bottom = st.map(([lo], i) => `${x(i)},${y(lo)}`).reverse().join(" ");
          return (
            <g key={series[si].name}>
              {stacked && <polygon points={`${top} ${bottom}`} fill={`var(--series-${si + 1})`} opacity={0.7} stroke="var(--surface)" strokeWidth={2} />}
              <polyline points={top} fill="none" stroke={`var(--series-${si + 1})`} strokeWidth={2} strokeLinejoin="round" />
            </g>
          );
        })}
        {hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} className="crosshair" />
            {stacks.map((st, si) => (
              <circle key={si} cx={x(hover)} cy={y(st[hover][1])} r={4} fill={`var(--series-${si + 1})`} stroke="var(--surface)" strokeWidth={2} />
            ))}
            <Tooltip x={x(hover)} label={labels[hover]} rows={series.map((s, si) => ({ name: s.name, value: s.values[hover] ?? 0, slot: si + 1 }))} />
          </g>
        )}
      </svg>
      <Legend series={series} />
    </Figure>
  );
}

/** Single-series bar chart. */
export function BarChart({ title, labels, values, empty }: { title: string; labels: string[]; values: number[]; empty?: string }) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...values));
  const { y } = useScales(labels, max);
  if (!labels.length) return <Figure title={title}><p className="muted">{empty ?? "No data yet."}</p></Figure>;
  const bw = (W - PAD.l - PAD.r) / labels.length;
  return (
    <Figure title={title}>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" onMouseLeave={() => setHover(null)} role="img" aria-labelledby={id}>
        <title id={id}>{title}</title>
        <Axes labels={labels} max={max} y={y} />
        {values.map((v, i) => {
          const x0 = PAD.l + i * bw + 2, w = Math.max(2, bw - 4), top = y(v), h = H - PAD.b - top;
          return (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <rect x={x0} y={PAD.t} width={w} height={H - PAD.t - PAD.b} fill="transparent" />
              <rect x={x0} y={top} width={w} height={Math.max(0, h)} rx={4} fill="var(--series-1)" opacity={hover === i ? 1 : 0.85} />
            </g>
          );
        })}
        {hover != null && <Tooltip x={PAD.l + hover * bw + bw / 2} label={labels[hover]} rows={[{ name: title, value: values[hover], slot: 1 }]} />}
      </svg>
    </Figure>
  );
}

function Figure({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <figure className="figure">
      <figcaption>{title}</figcaption>
      {children}
    </figure>
  );
}
