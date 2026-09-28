import { useEffect, useState } from "react";
import { api, authClient, type Workspace } from "./api";
import { ModeProvider, useT } from "./mode";
import { Board } from "./Board";

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
      {mode === "up" && <input placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}
      <input placeholder="Email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      <input placeholder="Password" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
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
  const [modes, setModes] = useState<Array<{ id: string; name: string }>>([]);

  const refreshList = () => api.workspaces().then(setWorkspaces);
  useEffect(() => {
    refreshList();
    api.modes().then(setModes);
  }, []);

  async function open(id: string) {
    setCurrent(await api.workspace(id));
  }

  async function createOrgAndWorkspace() {
    const name = prompt("Organization name");
    if (!name) return;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const org = await authClient.organization.create({ name, slug });
    if (org.error || !org.data) return alert(org.error?.message ?? "Failed");
    const { id } = await api.createWorkspace({ organizationId: org.data.id, name: "General", slug: "general", mode: "knowledge" });
    await refreshList();
    open(id);
  }

  async function createWorkspace() {
    if (!orgs?.length) return createOrgAndWorkspace();
    const name = prompt("Workspace name");
    if (!name) return;
    const mode = prompt(`Mode (${modes.map((m) => m.id).join(" | ")})`, "knowledge") ?? "knowledge";
    const { id } = await api.createWorkspace({ organizationId: orgs[0].id, name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), mode });
    await refreshList();
    open(id);
  }

  async function switchMode(mode: string) {
    if (!current) return;
    await api.setMode(current.id, mode);
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
                {w.name} <small>{w.mode}</small>
              </button>
            </li>
          ))}
        </ul>
        <button onClick={createWorkspace}>New workspace</button>
        <button className="link" onClick={() => authClient.signOut()}>
          Sign out
        </button>
      </aside>
      <main>
        {current ? (
          <ModeProvider profile={current.profile}>
            <WorkspaceHeader ws={current} modes={modes} onSwitch={switchMode} />
            <Board ws={current} />
          </ModeProvider>
        ) : (
          <p className="muted">Pick a workspace or create one.</p>
        )}
      </main>
    </div>
  );
}

function WorkspaceHeader({ ws, modes, onSwitch }: { ws: Workspace; modes: Array<{ id: string; name: string }>; onSwitch: (m: string) => void }) {
  const t = useT();
  return (
    <header className="ws-header">
      <h1>{ws.name}</h1>
      <span className="muted">
        {t("item.many")} across {ws.stages.length} {t("stage.many").toLowerCase()}
      </span>
      <label>
        Mode
        <select value={ws.mode} onChange={(e) => onSwitch(e.target.value)}>
          {modes.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
    </header>
  );
}
