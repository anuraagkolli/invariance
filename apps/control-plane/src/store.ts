import type { AppManifest, SignedEnvelope, DesignConfig } from "@invariance/schema";

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

export interface ThemeVersionMeta {
  prompt?: string;
  source?: "pipeline" | "pack" | "rollback";
  description?: string;
}

export interface ThemeVersionEntry {
  seq: number;
  at: string; // ISO timestamp
  theme: Record<string, unknown>;
  meta?: ThemeVersionMeta;
}

const MAX_EVENTS_PER_APP = 50_000;

/**
 * Storage boundary for the control plane. All methods are async and every
 * mutation is an explicit operation (no caller ever mutates a returned
 * record) so durable backends can implement each as a query.
 */
export interface Store {
  putManifest(appId: string, manifest: AppManifest): Promise<void>;
  currentManifest(appId: string): Promise<AppManifest | null>;
  /**
   * The "developer release" sweep: mark every active mod bound to a version
   * other than `currentVersion` stale. Returns how many were marked.
   */
  markActiveModsStale(appId: string, currentVersion: string): Promise<number>;

  /** A subject's full revision history, oldest first. */
  subjectMods(appId: string, subjectId: string): Promise<ModRecord[]>;
  /** The latest non-superseded revision for a subject, if any. */
  latestMod(appId: string, subjectId: string): Promise<ModRecord | null>;
  allMods(appId: string): Promise<ModRecord[]>;
  findMod(appId: string, modId: string): Promise<ModRecord | null>;
  insertMod(record: ModRecord): Promise<void>;
  /** Returns the updated record, or null if the mod does not exist. */
  updateModStatus(
    appId: string,
    modId: string,
    status: ModRecordStatus,
    reasons?: string[],
  ): Promise<ModRecord | null>;

  /** Immutable content-addressed envelopes (the CDN stand-in). */
  putBundle(appId: string, envelope: SignedEnvelope): Promise<void>;
  getBundle(appId: string, contentHash: string): Promise<SignedEnvelope | null>;

  addEvent(event: AnalyticsEvent): Promise<void>;
  /** Chronological; `subjectId` filters, `limit` keeps the most recent N. */
  listEvents(
    appId: string,
    opts?: { subjectId?: string; limit?: number },
  ): Promise<AnalyticsEvent[]>;

  /** Tunable look-invariants; defaults to {} when never set. */
  getDesignConfig(appId: string): Promise<DesignConfig>;
  putDesignConfig(appId: string, config: DesignConfig): Promise<void>;

  /** Latest theme doc for a subject's timeline, or null. */
  getLatestTheme(appId: string, userId: string): Promise<Record<string, unknown> | null>;
  /** Append a new immutable version (monotonic seq, ISO at, cap ~50). */
  appendThemeVersion(
    appId: string,
    userId: string,
    theme: Record<string, unknown>,
    meta?: ThemeVersionMeta,
  ): Promise<ThemeVersionEntry>;
  /** A subject's versions, newest first. */
  listThemeVersions(appId: string, userId: string): Promise<ThemeVersionEntry[]>;
  /** Per-user timeline summaries for this app (newest entry's prompt/source surfaced). */
  listThemeTimelines(appId: string): Promise<ThemeTimelineSummary[]>;
}

/** One row of the per-user theme timeline list (Console dashboard + Themes view). */
export interface ThemeTimelineSummary {
  userId: string;
  count: number;
  latestAt: string;
  latestPrompt?: string;
  latestSource?: ThemeVersionMeta["source"];
}

interface AppState {
  manifests: Map<string, AppManifest>;
  currentManifestVersion: string | null;
  /** subjectId -> ordered mod revisions (latest last). */
  modsBySubject: Map<string, ModRecord[]>;
  bundlesByHash: Map<string, SignedEnvelope>;
  events: AnalyticsEvent[];
  designConfig: DesignConfig;
  /** userId -> theme timeline (entries oldest-first). */
  themeTimelines: Map<string, { nextSeq: number; entries: ThemeVersionEntry[] }>;
}

/** In-memory Store: dev and test backend; PgStore is the durable one. */
export class MemoryStore implements Store {
  private apps = new Map<string, AppState>();

  private app(appId: string): AppState {
    let state = this.apps.get(appId);
    if (!state) {
      state = {
        manifests: new Map(),
        currentManifestVersion: null,
        modsBySubject: new Map(),
        bundlesByHash: new Map(),
        events: [],
        designConfig: {},
        themeTimelines: new Map(),
      };
      this.apps.set(appId, state);
    }
    return state;
  }

  async putManifest(appId: string, manifest: AppManifest): Promise<void> {
    const state = this.app(appId);
    state.manifests.set(manifest.version, manifest);
    state.currentManifestVersion = manifest.version;
  }

  async currentManifest(appId: string): Promise<AppManifest | null> {
    const state = this.app(appId);
    if (!state.currentManifestVersion) return null;
    return state.manifests.get(state.currentManifestVersion) ?? null;
  }

  async markActiveModsStale(appId: string, currentVersion: string): Promise<number> {
    let count = 0;
    for (const mods of this.app(appId).modsBySubject.values()) {
      for (const mod of mods) {
        if (mod.status === "active" && mod.boundManifestVersion !== currentVersion) {
          mod.status = "stale";
          count++;
        }
      }
    }
    return count;
  }

  async subjectMods(appId: string, subjectId: string): Promise<ModRecord[]> {
    return this.app(appId).modsBySubject.get(subjectId) ?? [];
  }

  async latestMod(appId: string, subjectId: string): Promise<ModRecord | null> {
    const mods = await this.subjectMods(appId, subjectId);
    for (let i = mods.length - 1; i >= 0; i--) {
      const mod = mods[i];
      if (mod && mod.status !== "superseded") return mod;
    }
    return null;
  }

  async allMods(appId: string): Promise<ModRecord[]> {
    return [...this.app(appId).modsBySubject.values()].flat();
  }

  async findMod(appId: string, modId: string): Promise<ModRecord | null> {
    return (await this.allMods(appId)).find((m) => m.modId === modId) ?? null;
  }

  async insertMod(record: ModRecord): Promise<void> {
    const state = this.app(record.appId);
    let mods = state.modsBySubject.get(record.subjectId);
    if (!mods) {
      mods = [];
      state.modsBySubject.set(record.subjectId, mods);
    }
    mods.push(record);
  }

  async updateModStatus(
    appId: string,
    modId: string,
    status: ModRecordStatus,
    reasons?: string[],
  ): Promise<ModRecord | null> {
    const mod = await this.findMod(appId, modId);
    if (!mod) return null;
    mod.status = status;
    if (reasons !== undefined) mod.reasons = reasons;
    return mod;
  }

  async putBundle(appId: string, envelope: SignedEnvelope): Promise<void> {
    this.app(appId).bundlesByHash.set(envelope.contentHash, envelope);
  }

  async getBundle(appId: string, contentHash: string): Promise<SignedEnvelope | null> {
    return this.app(appId).bundlesByHash.get(contentHash) ?? null;
  }

  async addEvent(event: AnalyticsEvent): Promise<void> {
    const events = this.app(event.appId).events;
    events.push(event);
    if (events.length > MAX_EVENTS_PER_APP) {
      events.splice(0, events.length - MAX_EVENTS_PER_APP);
    }
  }

  async listEvents(
    appId: string,
    opts: { subjectId?: string; limit?: number } = {},
  ): Promise<AnalyticsEvent[]> {
    let events = this.app(appId).events;
    if (opts.subjectId !== undefined) {
      events = events.filter((e) => e.subjectId === opts.subjectId);
    }
    if (opts.limit !== undefined) events = events.slice(-opts.limit);
    return [...events];
  }

  async getDesignConfig(appId: string): Promise<DesignConfig> {
    return this.app(appId).designConfig;
  }

  async putDesignConfig(appId: string, config: DesignConfig): Promise<void> {
    this.app(appId).designConfig = config;
  }

  async appendThemeVersion(
    appId: string,
    userId: string,
    theme: Record<string, unknown>,
    meta?: ThemeVersionMeta,
  ): Promise<ThemeVersionEntry> {
    const state = this.app(appId);
    let timeline = state.themeTimelines.get(userId);
    if (!timeline) {
      timeline = { nextSeq: 1, entries: [] };
      state.themeTimelines.set(userId, timeline);
    }
    const entry: ThemeVersionEntry = {
      seq: timeline.nextSeq,
      at: new Date().toISOString(),
      theme,
      ...(meta !== undefined ? { meta } : {}),
    };
    timeline.entries.push(entry);
    // Prune to the most-recent 50 (oldest first, so slice from the end)
    if (timeline.entries.length > 50) {
      timeline.entries = timeline.entries.slice(-50);
    }
    timeline.nextSeq++;
    return entry;
  }

  async getLatestTheme(
    appId: string,
    userId: string,
  ): Promise<Record<string, unknown> | null> {
    const timeline = this.app(appId).themeTimelines.get(userId);
    if (!timeline || timeline.entries.length === 0) return null;
    return timeline.entries[timeline.entries.length - 1]!.theme;
  }

  async listThemeVersions(appId: string, userId: string): Promise<ThemeVersionEntry[]> {
    const timeline = this.app(appId).themeTimelines.get(userId);
    if (!timeline) return [];
    return [...timeline.entries].reverse();
  }

  async listThemeTimelines(appId: string): Promise<ThemeTimelineSummary[]> {
    const state = this.app(appId);
    const result: ThemeTimelineSummary[] = [];
    for (const [userId, timeline] of state.themeTimelines) {
      if (timeline.entries.length > 0) {
        const latest = timeline.entries[timeline.entries.length - 1]!;
        result.push({
          userId,
          count: timeline.entries.length,
          latestAt: latest.at,
          ...(latest.meta?.prompt ? { latestPrompt: latest.meta.prompt } : {}),
          ...(latest.meta?.source ? { latestSource: latest.meta.source } : {}),
        });
      }
    }
    return result;
  }
}
