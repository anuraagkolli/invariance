import { ModBundleSchema, type HookPhase, type ModBundle } from "@invariance/schema";
import type { MemoryStore, ModRecord } from "../store";

/**
 * Mod classification: what surfaces a mod touches and through which declared
 * capabilities. Derived purely from the bundle — no event data, no LLM — so
 * the developer console can answer "what are users changing?" deterministically.
 */
export interface ModClassification {
  surfaces: { tokens: number; styles: number; slots: number; hooks: number };
  tokensTouched: string[];
  componentsTouched: string[];
  endpointsHooked: string[];
  phases: HookPhase[];
}

export function classifyBundle(bundle: ModBundle): ModClassification {
  const surfaces = { tokens: 0, styles: 0, slots: 0, hooks: bundle.hooks.length };
  const tokensTouched = new Set<string>();
  const componentsTouched = new Set<string>();
  for (const op of bundle.uiOps) {
    switch (op.type) {
      case "token-override":
        surfaces.tokens++;
        tokensTouched.add(op.token);
        break;
      case "style-rule":
        surfaces.styles++;
        break;
      case "slot-override":
        surfaces.slots++;
        componentsTouched.add(`${op.componentId}.${op.slot}`);
        break;
    }
  }
  return {
    surfaces,
    tokensTouched: [...tokensTouched],
    componentsTouched: [...componentsTouched],
    endpointsHooked: [...new Set(bundle.hooks.map((h) => h.trigger.endpointId))],
    phases: [...new Set(bundle.hooks.map((h) => h.trigger.phase))],
  };
}

export function classifyRecord(record: ModRecord): ModClassification | null {
  try {
    return classifyBundle(ModBundleSchema.parse(JSON.parse(record.envelope.payload)));
  } catch {
    return null;
  }
}

interface RankedEntry {
  name: string;
  count: number;
}

function top(counter: Map<string, number>, limit = 10): RankedEntry[] {
  return [...counter.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

function bump(counter: Map<string, number>, key: string, by = 1): void {
  counter.set(key, (counter.get(key) ?? 0) + by);
}

export interface AnalyticsSummary {
  events: { total: number; byType: Record<string, number> };
  mods: { total: number; byStatus: Record<string, number>; degraded: number };
  topTokens: RankedEntry[];
  topEndpoints: RankedEntry[];
  topComponents: RankedEntry[];
  recentPrompts: Array<{ subjectId: string; prompt: string; at: string }>;
}

/** Aggregate view over every subject of one app. */
export function summarizeApp(store: MemoryStore, appId: string): AnalyticsSummary {
  const state = store.app(appId);

  const byType: Record<string, number> = {};
  for (const event of state.events) {
    byType[event.type] = (byType[event.type] ?? 0) + 1;
  }

  const byStatus: Record<string, number> = {};
  const tokens = new Map<string, number>();
  const endpoints = new Map<string, number>();
  const components = new Map<string, number>();
  const prompts: Array<{ subjectId: string; prompt: string; at: string }> = [];

  for (const record of store.allMods(appId)) {
    byStatus[record.status] = (byStatus[record.status] ?? 0) + 1;
    if (record.status === "superseded") continue; // count live surfaces only
    const classification = classifyRecord(record);
    if (classification) {
      for (const token of classification.tokensTouched) bump(tokens, token);
      for (const endpoint of classification.endpointsHooked) bump(endpoints, endpoint);
      for (const component of classification.componentsTouched) bump(components, component);
    }
    const lastPrompt = record.prompts.at(-1);
    if (lastPrompt) {
      prompts.push({ subjectId: record.subjectId, prompt: lastPrompt, at: record.createdAt });
    }
  }
  prompts.sort((a, b) => (a.at < b.at ? 1 : -1));

  return {
    events: { total: state.events.length, byType },
    mods: {
      total: store.allMods(appId).length,
      byStatus,
      degraded: byStatus["degraded"] ?? 0,
    },
    topTokens: top(tokens),
    topEndpoints: top(endpoints),
    topComponents: top(components),
    recentPrompts: prompts.slice(0, 20),
  };
}

/** Public projection of a mod record: everything but the signed payload. */
export function modAdminView(record: ModRecord) {
  return {
    modId: record.modId,
    subjectId: record.subjectId,
    revision: record.revision,
    status: record.status,
    contentHash: record.contentHash,
    boundManifestVersion: record.boundManifestVersion,
    prompts: record.prompts,
    reasons: record.reasons,
    createdAt: record.createdAt,
    classification: classifyRecord(record),
  };
}

/**
 * Drill-down projection: the admin view plus the bundle's actual contents
 * (UI ops and hooks, including source) so the developer can inspect exactly
 * what a mod does. Still excludes the envelope — signatures stay distribution
 * machinery, not console data.
 */
export function modDetailView(record: ModRecord) {
  const base = modAdminView(record);
  try {
    const bundle = ModBundleSchema.parse(JSON.parse(record.envelope.payload));
    return {
      ...base,
      contents: {
        uiOps: bundle.uiOps,
        hooks: bundle.hooks,
        capabilities: bundle.capabilities,
      },
    };
  } catch {
    return { ...base, contents: null };
  }
}
