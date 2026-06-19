import type { ThemeArtifact, Pointer, StyleSpec, Verdict } from "@invariance/theming";

// ─── Row / record types (ledger §9.2) ─────────────────────────────────────
export type AuditRow = {
  tenant: string;
  hash: string; // the published artifact hash
  prompt: string; // tenant admin prompt — control-plane-side only, never in the bundle
  styleSpec: StyleSpec; // produced spec — STORED (functional read path)
  verifierReport: Verdict;
  actor: string; // tenant admin identity
  timestamp: string; // ISO
  vocabVersion: string; // versions live AT PUBLISH (stamp)
  profileVersion: string;
};

export type PublishedRecord = {
  styleSpec: StyleSpec;
  vocabVersion: string;
  profileVersion: string;
};

// ─── Interfaces (ledger §9.1) ──────────────────────────────────────────────
// Content-addressed blob store (R2): immutable artifacts keyed by hash.
export interface BlobStore {
  putArtifact(hash: string, artifact: ThemeArtifact): Promise<void>; // idempotent (content-addressed)
  getArtifact(hash: string): Promise<ThemeArtifact | null>;
}

// Short-TTL mutable pointer store (KV): tenant → Pointer.
export interface PointerStore {
  getPointer(tenant: string): Promise<Pointer | null>; // null = pointer miss (distinct from disabled)
  putPointer(tenant: string, pointer: Pointer): Promise<void>;
}

// Relational governance store (D1): audit trail + functional read path (reset/recompile).
export interface AuditStore {
  recordAudit(row: AuditRow): Promise<void>;
  getPublishedSpec(tenant: string, hash: string): Promise<PublishedRecord | null>;
}

// ─── In-memory implementations (tests) ─────────────────────────────────────
export class InMemoryBlobStore implements BlobStore {
  private readonly map = new Map<string, ThemeArtifact>();
  async putArtifact(hash: string, artifact: ThemeArtifact): Promise<void> {
    // content-addressed ⇒ idempotent: same hash means same content; last write is identical.
    this.map.set(hash, artifact);
  }
  async getArtifact(hash: string): Promise<ThemeArtifact | null> {
    return this.map.get(hash) ?? null;
  }
}

export class InMemoryPointerStore implements PointerStore {
  private readonly map = new Map<string, Pointer>();
  async getPointer(tenant: string): Promise<Pointer | null> {
    return this.map.get(tenant) ?? null;
  }
  async putPointer(tenant: string, pointer: Pointer): Promise<void> {
    this.map.set(tenant, pointer);
  }
}

export class InMemoryAuditStore implements AuditStore {
  private readonly rows: AuditRow[] = [];
  async recordAudit(row: AuditRow): Promise<void> {
    this.rows.push(row);
  }
  async getPublishedSpec(tenant: string, hash: string): Promise<PublishedRecord | null> {
    // last-wins read of the matching (tenant, hash) audit row.
    for (let i = this.rows.length - 1; i >= 0; i--) {
      const r = this.rows[i]!;
      if (r.tenant === tenant && r.hash === hash) {
        return { styleSpec: r.styleSpec, vocabVersion: r.vocabVersion, profileVersion: r.profileVersion };
      }
    }
    return null;
  }
  // test/retention helper — the append-only log.
  listAudits(): AuditRow[] {
    return [...this.rows];
  }
}
