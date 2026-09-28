import { useEffect, useMemo, useRef, useState } from "react";
import { api, authClient, type Workspace } from "./api";
import { ModeProvider, useMode, useT } from "./mode";
import { useItems } from "./useItems";
import { Board } from "./Board";
import { ListView } from "./ListView";
import { CalendarView } from "./CalendarView";
import { ReportsView } from "./ReportsView";
import { useCycles } from "./useCycles";
import { CyclesPanel } from "./CyclesPanel";

type ModeSummary = { id: string; name: string; description: string };

export function App() {
  const { data: session, isPending } = authClient.useSession();
  if (isPending) return <p className="muted">Loading</p>;
  if (!session) return <Auth />;
  return <Shell />;
}

function Auth() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const r =
      mode === "in"
        ? await authClient.signIn.email({ email: f.email, password: f.password })
        : await authClient.signUp.email({ email: f.email, password: f.password, name: f.name });
    if (r.error) setErr(r.error.message ?? "Failed");
  }
  return (
    <form className="auth" onSubmit={submit}>
      <h1>Cadence</h1>
      {mode === "up" && <input placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />}
      <input placeholder="Email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
      <input placeholder="Password" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required minLength={8} />
      <button type="submit">{mode === "in" ? "Sign in" : "Create account"}</button>
      <button type="button" className="link" onClick={() => setMode(mode === "in" ? "up" : "in")}>
        {mode === "in" ? "Need an account?" : "Have an account?"}
      </button>
      {err && <p className="error">{err}</p>}
    </form>
  );
}

function Shell() {
  const { data: orgs } = authClient.useListOrganizations();
  const [workspaces, setWorkspaces] = useState<Array<{ id: string; name: string; mode: string }>>([]);
  const [current, setCurrent] = useState<Workspace | null>(null);
  const [modes, setModes] = useState<ModeSummary[]>([]);
  const [creating, setCreating] = useState(false);

  const refreshList = () => api.workspaces().then(setWorkspaces);
  useEffect(() => {
    refreshList();
    api.modes().then(setModes);
  }, []);

  async function open(id: string) {
    setCurrent(await api.workspace(id));
  }

  async function switchMode(mode: string) {
    if (!current) return;
    await api.setMode(current.id, mode);
    await refreshList();
    open(current.id);
  }

  return (
    <div className="shell">
      <aside>
        <h2>Cadence</h2>
        <ul>
          {workspaces.map((w) => (
            <li key={w.id}>
              <button className={current?.id === w.id ? "active" : ""} onClick={() => open(w.id)}>
                {w.name} <small>{modes.find((m) => m.id === w.mode)?.name ?? w.mode}</small>
              </button>
            </li>
          ))}
        </ul>
        <button onClick={() => setCreating(true)}>New workspace</button>
        <button className="link" onClick={() => authClient.signOut()}>
          Sign out
        </button>
      </aside>
      <main>
        {creating ? (
          <NewWorkspace
            orgs={orgs ?? []}
            modes={modes}
            onDone={async (id) => {
              setCreating(false);
              await refreshList();
              if (id) open(id);
            }}
          />
        ) : current ? (
          <ModeProvider profile={current.profile} key={current.id + current.mode}>
            <WorkspaceScreen ws={current} modes={modes} onSwitch={switchMode} />
          </ModeProvider>
        ) : (
          <p className="muted">Pick a workspace or create one.</p>
        )}
      </main>
    </div>
  );
}

function NewWorkspace({ orgs, modes, onDone }: { orgs: Array<{ id: string; name: string }>; modes: ModeSummary[]; onDone: (id: string | null) => void }) {
  const [orgName, setOrgName] = useState("");
  const [orgId, setOrgId] = useState(orgs[0]?.id ?? "");
  const [name, setName] = useState("");
  const [mode, setMode] = useState(modes[0]?.id ?? "knowledge");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "workspace";

  useEffect(() => { if (!orgId && orgs[0]) setOrgId(orgs[0].id); }, [orgs, orgId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      let organizationId = orgId;
      if (!organizationId) {
        const org = await authClient.organization.create({ name: orgName, slug: slugify(orgName) + "-" + Math.random().toString(36).slice(2, 6) });
        if (org.error || !org.data) throw new Error(org.error?.message ?? "Could not create organization");
        organizationId = org.data.id;
      }
      const { id } = await api.createWorkspace({ organizationId, name, slug: slugify(name), mode });
      onDone(id);
    } catch (e) {
      setErr(String((e as Error).message ?? e));
      setBusy(false);
    }
  }

  return (
    <form className="new-workspace" onSubmit={submit}>
      <h1>New workspace</h1>
      {orgs.length === 0 ? (
        <label>
          Organization name
          <input value={orgName} onChange={(e) => setOrgName(e.target.value)} required placeholder="Acme" />
        </label>
      ) : (
        <label>
          Organization
          <select value={orgId} onChange={(e) => setOrgId(e.target.value)}>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
      )}
      <label>
        Workspace name
        <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Engineering" autoFocus />
      </label>
      <fieldset>
        <legend>Mode</legend>
        {modes.map((m) => (
          <label key={m.id} className="radio">
            <input type="radio" name="mode" value={m.id} checked={mode === m.id} onChange={() => setMode(m.id)} />
            <span><strong>{m.name}</strong><br /><small className="muted">{m.description}</small></span>
          </label>
        ))}
      </fieldset>
      <div className="row">
        <button type="submit" disabled={busy}>Create</button>
        <button type="button" className="link" onClick={() => onDone(null)}>Cancel</button>
      </div>
      {err && <p className="error">{err}</p>}
    </form>
  );
}

type View = "board" | "list" | "calendar" | "timeline" | "reports";

/** Cycle filter: "" = all, "none" = unassigned, otherwise a cycle id. Defaults to the current cycle once loaded. */
type CycleFilter = "" | "none" | string;

function WorkspaceScreen({ ws, modes, onSwitch }: { ws: Workspace; modes: ModeSummary[]; onSwitch: (m: string) => void }) {
  const t = useT();
  const { features } = useMode();
  const store = useItems(ws.id);
  const cyc = useCycles(ws.id);
  const [draft, setDraft] = useState("");
  const [managing, setManaging] = useState(false);

  const hasReports = features.charts.progress || features.charts.throughput || features.charts.flow;
  const views: View[] = [...features.views, ...(hasReports ? (["reports"] as View[]) : [])];
  const [view, setView] = useState<View>(views[0]);
  const active: View = views.includes(view) ? view : views[0];

  // Filter default is decided once, after cycles and items have both loaded:
  // the current cycle if it has any items, otherwise everything. After that
  // the user owns it; creating or assigning cycles never moves it.
  const [filter, setFilter] = useState<CycleFilter>("");
  const decided = useRef(false);
  useEffect(() => {
    if (decided.current || !cyc.loaded || !store.loaded) return;
    decided.current = true;
    if (cyc.active && store.items.some((i) => i.cycleId === cyc.active!.id)) setFilter(cyc.active.id);
  }, [cyc.loaded, store.loaded, cyc.active, store.items]);
  const effectiveFilter = filter;
  const filtered = useMemo(() => {
    if (effectiveFilter === "") return store.items;
    if (effectiveFilter === "none") return store.items.filter((i) => !i.cycleId);
    return store.items.filter((i) => i.cycleId === effectiveFilter);
  }, [store.items, effectiveFilter]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    // New items land in the cycle being viewed, so the board does not appear to swallow them.
    const cycleId = effectiveFilter && effectiveFilter !== "none" ? effectiveFilter : undefined;
    await store.create(draft.trim(), cycleId ? { cycleId } : {});
    setDraft("");
  }

  const viewLabel: Record<View, string> = {
    board: "Board",
    list: "List",
    calendar: "Calendar",
    timeline: "Timeline",
    reports: "Reports",
  };

  return (
    <>
      <header className="ws-header">
        <h1>{ws.name}</h1>
        <nav className="views">
          {views.map((v) => (
            <button key={v} className={active === v ? "active" : ""} onClick={() => setView(v)}>{viewLabel[v]}</button>
          ))}
        </nav>
        {active !== "reports" && (
          <label>
            {t("cycle.one")}
            <select value={effectiveFilter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">All</option>
              <option value="none">No {t("cycle.one").toLowerCase()}</option>
              {cyc.cycles.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{cyc.active?.id === c.id ? " (current)" : ""}</option>
              ))}
            </select>
            <button type="button" className="link" onClick={() => setManaging(true)}>Manage</button>
          </label>
        )}
        <label>
          Mode
          <select value={ws.mode} onChange={(e) => onSwitch(e.target.value)}>
            {modes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
      </header>

      {managing && <CyclesPanel store={cyc} onClose={() => setManaging(false)} />}

      {active !== "reports" && (
        <form className="new-item" onSubmit={create}>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t("actions.create")} />
          <button type="submit">{t("actions.create")}</button>
        </form>
      )}

      {active === "board" && <Board ws={ws} items={filtered} cycles={cyc.cycles} patch={store.patch} move={store.move} />}
      {active === "list" && <ListView ws={ws} items={filtered} cycles={cyc.cycles} patch={store.patch} />}
      {active === "calendar" && <CalendarView items={filtered} patch={store.patch} />}
      {active === "timeline" && <p className="muted">Timeline is not built yet.</p>}
      {active === "reports" && <ReportsView ws={ws} cycles={cyc.cycles} activeCycleId={cyc.active?.id ?? null} />}
    </>
  );
}
