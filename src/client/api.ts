import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";
import type { ModeProfile } from "@modes/schema";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL ?? "",
  plugins: [organizationClient()],
});

const BASE = import.meta.env.VITE_API_URL ?? "";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(BASE + path, {
    credentials: "include",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json() as Promise<T>;
}

export type Stage = { id: string; name: string; position: number; isTerminal: boolean };
export type Workspace = {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  mode: string;
  profile: ModeProfile;
  stages: Stage[];
};
export type Item = {
  id: string;
  number: number;
  title: string;
  description: string | null;
  stageId: string | null;
  position: number;
  containerId: string | null;
  assigneeId: string | null;
  reviewerId: string | null;
  size: number | null;
  cycleId: string | null;
  dueOn: string | null; // YYYY-MM-DD
  references: Array<{ kind: string; url: string; label?: string }>;
  closedAt: string | null;
};

export type Cycle = { id: string; name: string; startsOn: string; endsOn: string }; // dates as YYYY-MM-DD
export type Report = {
  progress: Array<{ day: string; open: number; closed: number }>;
  throughput: Array<{ week: string; size: number; count: number }>;
  flow: Array<{ day: string; byStage: Record<string, number> }>;
};

/** Pull a readable message out of an API error; fall back to the raw text. */
export function apiMessage(e: unknown): string {
  const m = String((e as Error).message ?? e);
  const body = m.replace(/^\d{3}\s*/, "");
  try {
    const j = JSON.parse(body);
    if (j.issues?.length) return j.issues.map((i: { message: string }) => i.message).join("; ");
    if (typeof j.error === "string") return j.error;
  } catch {}
  return m;
}

export const api = {
  modes: () => req<Array<{ id: string; name: string; description: string }>>("/api/modes"),
  workspaces: () => req<Array<Omit<Workspace, "profile" | "stages">>>("/api/workspaces"),
  createWorkspace: (body: { organizationId: string; name: string; slug: string; mode: string }) =>
    req<{ id: string }>("/api/workspaces", { method: "POST", body: JSON.stringify(body) }),
  workspace: (id: string) => req<Workspace>(`/api/workspaces/${id}`),
  setMode: (id: string, mode: string) => req(`/api/workspaces/${id}`, { method: "PATCH", body: JSON.stringify({ mode }) }),
  items: (wsId: string) => req<Item[]>(`/api/workspaces/${wsId}/items`),
  createItem: (wsId: string, body: Partial<Item> & { title: string }) =>
    req<{ id: string; number: number }>(`/api/workspaces/${wsId}/items`, { method: "POST", body: JSON.stringify(body) }),
  updateItem: (wsId: string, itemId: string, body: Partial<Item>) =>
    req<Item>(`/api/workspaces/${wsId}/items/${itemId}`, { method: "PATCH", body: JSON.stringify(body) }),
  cycles: (wsId: string) => req<Cycle[]>(`/api/workspaces/${wsId}/cycles`),
  createCycle: (wsId: string, body: Omit<Cycle, "id">) => req<Cycle>(`/api/workspaces/${wsId}/cycles`, { method: "POST", body: JSON.stringify(body) }),
  updateCycle: (wsId: string, id: string, body: Partial<Omit<Cycle, "id">>) =>
    req<Cycle>(`/api/workspaces/${wsId}/cycles/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteCycle: (wsId: string, id: string) => req(`/api/workspaces/${wsId}/cycles/${id}`, { method: "DELETE" }),
  report: (wsId: string, cycleId: string | null) =>
    req<Report>(`/api/workspaces/${wsId}/reports${cycleId ? `?cycleId=${encodeURIComponent(cycleId)}` : ""}`),
  moveItem: (wsId: string, itemId: string, body: { stageId: string; afterItemId?: string | null; beforeItemId?: string | null }) =>
    req<Item>(`/api/workspaces/${wsId}/items/${itemId}/move`, { method: "POST", body: JSON.stringify(body) }),
};
