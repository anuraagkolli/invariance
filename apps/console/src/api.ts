import type { AppManifest, HookPhase } from "@invariance/schema";

// Wire types for the control-plane admin API (kept local: the console is a
// browser app and must not import node-only control-plane code).
export interface ModClassification {
  surfaces: { tokens: number; styles: number; slots: number; hooks: number };
  tokensTouched: string[];
  componentsTouched: string[];
  endpointsHooked: string[];
  phases: HookPhase[];
}

interface RankedEntry {
  name: string;
  count: number;
}

export interface AnalyticsSummary {
  events: { total: number; byType: Record<string, number> };
  mods: { total: number; byStatus: Record<string, number>; degraded: number };
  topTokens: RankedEntry[];
  topEndpoints: RankedEntry[];
  topComponents: RankedEntry[];
  recentPrompts: Array<{ subjectId: string; prompt: string; at: string }>;
}

export interface ModRow {
  modId: string;
  subjectId: string;
  revision: number;
  status: string;
  contentHash: string;
  boundManifestVersion: string;
  prompts: string[];
  reasons: string[];
  createdAt: string;
  classification: ModClassification | null;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return (await res.json()) as T;
}

export const api = {
  manifest: (appId: string) => get<AppManifest>(`/v1/apps/${appId}/manifest`),
  summary: (appId: string) => get<AnalyticsSummary>(`/v1/apps/${appId}/analytics/summary`),
  mods: async (appId: string) => (await get<{ mods: ModRow[] }>(`/v1/apps/${appId}/mods`)).mods,
  kill: (appId: string, modId: string) =>
    fetch(`/v1/apps/${appId}/mods/${modId}/kill`, { method: "POST" }),
  restore: (appId: string, modId: string) =>
    fetch(`/v1/apps/${appId}/mods/${modId}/restore`, { method: "POST" }),
};
