import { useEffect, useMemo, useState } from "react";
import { api, type Cycle, type Report, type Workspace } from "./api";
import { BarChart, LineChart } from "./charts";
import { useMode, useT } from "./mode";

/**
 * Reports are gated per chart by features.charts. Terminology comes from the
 * profile, so "Burndown" and "Progress" are the same chart with different names.
 */
export function ReportsView({ ws, cycles, activeCycleId }: { ws: Workspace; cycles: Cycle[]; activeCycleId: string | null }) {
  const t = useT();
  const { features } = useMode();
  const [cycleId, setCycleId] = useState<string>(activeCycleId ?? "");
  const [report, setReport] = useState<Report | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setReport(null);
    setErr(null);
    api.report(ws.id, cycleId || null).then(setReport).catch((e) => setErr(String(e)));
  }, [ws.id, cycleId]);

  const stageName = useMemo(() => new Map(ws.stages.map((s) => [s.id, s.name])), [ws.stages]);

  const progress = useMemo(() => {
    if (!report) return null;
    return {
      labels: report.progress.map((p) => p.day.slice(5)),
      series: [
        { name: "Open", values: report.progress.map((p) => p.open) },
        { name: "Closed", values: report.progress.map((p) => p.closed) },
      ],
    };
  }, [report]);

  const flow = useMemo(() => {
    if (!report) return null;
    const labels = report.flow.map((f) => f.day.slice(5));
    // Fixed order by stage position so colors follow the stage, not the rank.
    const series = ws.stages.map((s) => ({ name: s.name, values: report.flow.map((f) => f.byStage[s.id] ?? 0) }));
    const unknown = report.flow.map((f) => f.byStage["none"] ?? 0);
    if (unknown.some((v) => v > 0)) series.push({ name: `No ${t("stage.one").toLowerCase()}`, values: unknown });
    // Not filtered: dropping an empty stage would shift every later stage's color slot.
    return { labels, series };
  }, [report, ws.stages, t]);

  const throughput = useMemo(() => {
    if (!report) return null;
    return { labels: report.throughput.map((w) => w.week), values: report.throughput.map((w) => (features.sizing ? w.size : w.count)) };
  }, [report, features.sizing]);

  if (err) return <p className="error">{err}</p>;
  if (!report || !progress || !flow || !throughput) return <p className="muted">Loading</p>;

  const empty = `Snapshots accrue daily. Check back after a few days of activity.`;

  return (
    <div className="reports">
      {cycles.length > 0 && (
        <div className="list-toolbar">
          <label>
            {t("cycle.one")}
            <select value={cycleId} onChange={(e) => setCycleId(e.target.value)}>
              <option value="">All</option>
              {cycles.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
        </div>
      )}
      {features.charts.progress && (
        <LineChart title={t("reports.progress")} labels={progress.labels} series={progress.series} empty={empty} />
      )}
      {features.charts.throughput && (
        <BarChart title={t("reports.throughput")} labels={throughput.labels} values={throughput.values} empty="Nothing closed in the last 12 weeks." />
      )}
      {features.charts.flow && (
        <LineChart title={t("reports.flow")} labels={flow.labels} series={flow.series} stacked empty={empty} />
      )}
      {(features.charts.progress || features.charts.flow) && (
        <details className="table-view">
          <summary>Table</summary>
          <table>
            <thead>
              <tr>
                <th>Day</th>
                <th>Open</th>
                <th>Closed</th>
                {ws.stages.map((s) => <th key={s.id}>{stageName.get(s.id)}</th>)}
              </tr>
            </thead>
            <tbody>
              {report.progress.map((p, i) => (
                <tr key={p.day}>
                  <td>{p.day}</td>
                  <td>{p.open}</td>
                  <td>{p.closed}</td>
                  {ws.stages.map((s) => <td key={s.id}>{report.flow[i]?.byStage[s.id] ?? 0}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}
