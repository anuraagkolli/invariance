import type { AppManifest, SignedEnvelope } from "@invariance/schema";

export type ModRecordStatus = "active" | "stale" | "degraded" | "disabled" | "superseded";

export interface ModRecord {
  modId: string;
  appId: string;
  subjectId: string;
  revision: number;
  contentHash: string;
  envelope: SignedEnvelope;
  status: ModRecordStatus;
  /** Every prompt that shaped this mod, in order — fuel for re-fix and analytics. */
  prompts: string[];
  /** Why the mod was degraded/rejected, when applicable. */
  reasons: string[];
  boundManifestVersion: string;
  createdAt: string;
}

export interface AnalyticsEvent {
  type: string;
  appId: string;
  subjectId?: string;
  modId?: string;
  detail?: Record<string, unknown>;
  at: number;
}

export interface AppState {
  manifests: Map<string, AppManifest>;
  currentManifestVersion: string | null;
  /** subjectId -> ordered mod revisions (latest last). */
  modsBySubject: Map<string, ModRecord[]>;
  /** contentHash -> immutable envelope (the "CDN"). */
  bundlesByHash: Map<string, SignedEnvelope>;
  events: AnalyticsEvent[];
}

/**
 * v1 storage: in-memory, behind this interface so a Postgres adapter can
 * replace it without touching module code.
 */
export class MemoryStore {
  private apps = new Map<string, AppState>();

  app(appId: string): AppState {
    let state = this.apps.get(appId);
    if (!state) {
      state = {
        manifests: new Map(),
        currentManifestVersion: null,
        modsBySubject: new Map(),
        bundlesByHash: new Map(),
        events: [],
      };
      this.apps.set(appId, state);
    }
    return state;
  }

  appIds(): string[] {
    return [...this.apps.keys()];
  }

  currentManifest(appId: string): AppManifest | null {
    const state = this.app(appId);
    if (!state.currentManifestVersion) return null;
    return state.manifests.get(state.currentManifestVersion) ?? null;
  }

  subjectMods(appId: string, subjectId: string): ModRecord[] {
    const state = this.app(appId);
    let mods = state.modsBySubject.get(subjectId);
    if (!mods) {
      mods = [];
      state.modsBySubject.set(subjectId, mods);
    }
    return mods;
  }

  /** The latest non-superseded revision for a subject, if any. */
  latestMod(appId: string, subjectId: string): ModRecord | null {
    const mods = this.subjectMods(appId, subjectId);
    for (let i = mods.length - 1; i >= 0; i--) {
      const mod = mods[i];
      if (mod && mod.status !== "superseded") return mod;
    }
    return null;
  }

  allMods(appId: string): ModRecord[] {
    return [...this.app(appId).modsBySubject.values()].flat();
  }

  findMod(appId: string, modId: string): ModRecord | null {
    return this.allMods(appId).find((m) => m.modId === modId) ?? null;
  }
}
