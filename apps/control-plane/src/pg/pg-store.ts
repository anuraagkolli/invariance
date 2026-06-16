import type { AppManifest, SignedEnvelope, DesignConfig } from "@invariance/schema";
import type {
  AnalyticsEvent,
  ModRecord,
  ModRecordStatus,
  Store,
  ThemeTimelineSummary,
  ThemeVersionEntry,
  ThemeVersionMeta,
} from "../store";
import { SCHEMA_SQL } from "./schema.sql";

/**
 * The slice of a Postgres client PgStore needs. Satisfied structurally by
 * both `pg.Pool` and PGlite, so production and tests share one
 * implementation.
 */
export interface SqlClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
}

/**
 * Run the idempotent schema; call once at boot before serving. Statements
 * run one at a time because PGlite's query() is single-statement.
 */
export async function migrate(client: SqlClient): Promise<void> {
  for (const statement of SCHEMA_SQL.split(";")) {
    if (statement.trim()) await client.query(statement);
  }
}

interface ModRow {
  app_id: string;
  mod_id: string;
  subject_id: string;
  revision: number;
  content_hash: string;
  envelope: SignedEnvelope;
  status: ModRecordStatus;
  prompts: string[];
  reasons: string[];
  bound_manifest_version: string;
  created_at: string;
}

function toRecord(row: ModRow): ModRecord {
  return {
    modId: row.mod_id,
    appId: row.app_id,
    subjectId: row.subject_id,
    revision: row.revision,
    contentHash: row.content_hash,
    envelope: row.envelope,
    status: row.status,
    prompts: row.prompts,
    reasons: row.reasons,
    boundManifestVersion: row.bound_manifest_version,
    createdAt: row.created_at,
  };
}

interface EventRow {
  app_id: string;
  type: string;
  subject_id: string | null;
  mod_id: string | null;
  detail: Record<string, unknown> | null;
  at: string | number;
}

function toEvent(row: EventRow): AnalyticsEvent {
  return {
    type: row.type,
    appId: row.app_id,
    ...(row.subject_id !== null ? { subjectId: row.subject_id } : {}),
    ...(row.mod_id !== null ? { modId: row.mod_id } : {}),
    ...(row.detail !== null ? { detail: row.detail } : {}),
    at: Number(row.at),
  };
}

/**
 * Durable Store on Postgres. All jsonb params go through JSON.stringify with
 * an explicit ::jsonb cast — node-postgres would otherwise turn JS arrays
 * (prompts, reasons) into Postgres array literals and corrupt the column.
 */
export class PgStore implements Store {
  constructor(private readonly db: SqlClient) {}

  async putManifest(appId: string, manifest: AppManifest): Promise<void> {
    await this.db.query(
      `INSERT INTO manifests (app_id, version, manifest)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (app_id, version) DO UPDATE SET manifest = excluded.manifest`,
      [appId, manifest.version, JSON.stringify(manifest)],
    );
    await this.db.query(
      `INSERT INTO apps (app_id, current_manifest_version) VALUES ($1, $2)
       ON CONFLICT (app_id) DO UPDATE SET current_manifest_version = excluded.current_manifest_version`,
      [appId, manifest.version],
    );
  }

  async currentManifest(appId: string): Promise<AppManifest | null> {
    const { rows } = await this.db.query(
      `SELECT m.manifest FROM apps a
       JOIN manifests m ON m.app_id = a.app_id AND m.version = a.current_manifest_version
       WHERE a.app_id = $1`,
      [appId],
    );
    const row = rows[0] as { manifest: AppManifest } | undefined;
    return row?.manifest ?? null;
  }

  async markActiveModsStale(appId: string, currentVersion: string): Promise<number> {
    const { rows } = await this.db.query(
      `UPDATE mod_records SET status = 'stale'
       WHERE app_id = $1 AND status = 'active' AND bound_manifest_version <> $2
       RETURNING mod_id`,
      [appId, currentVersion],
    );
    return rows.length;
  }

  async subjectMods(appId: string, subjectId: string): Promise<ModRecord[]> {
    const { rows } = await this.db.query(
      `SELECT * FROM mod_records WHERE app_id = $1 AND subject_id = $2 ORDER BY seq`,
      [appId, subjectId],
    );
    return (rows as ModRow[]).map(toRecord);
  }

  async latestMod(appId: string, subjectId: string): Promise<ModRecord | null> {
    const { rows } = await this.db.query(
      `SELECT * FROM mod_records
       WHERE app_id = $1 AND subject_id = $2 AND status <> 'superseded'
       ORDER BY seq DESC LIMIT 1`,
      [appId, subjectId],
    );
    const row = rows[0] as ModRow | undefined;
    return row ? toRecord(row) : null;
  }

  async allMods(appId: string): Promise<ModRecord[]> {
    const { rows } = await this.db.query(
      `SELECT * FROM mod_records WHERE app_id = $1 ORDER BY seq`,
      [appId],
    );
    return (rows as ModRow[]).map(toRecord);
  }

  async findMod(appId: string, modId: string): Promise<ModRecord | null> {
    const { rows } = await this.db.query(
      `SELECT * FROM mod_records WHERE app_id = $1 AND mod_id = $2`,
      [appId, modId],
    );
    const row = rows[0] as ModRow | undefined;
    return row ? toRecord(row) : null;
  }

  async insertMod(record: ModRecord): Promise<void> {
    await this.db.query(
      `INSERT INTO mod_records
         (app_id, mod_id, subject_id, revision, content_hash, envelope, status,
          prompts, reasons, bound_manifest_version, created_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb, $9::jsonb, $10, $11)`,
      [
        record.appId,
        record.modId,
        record.subjectId,
        record.revision,
        record.contentHash,
        JSON.stringify(record.envelope),
        record.status,
        JSON.stringify(record.prompts),
        JSON.stringify(record.reasons),
        record.boundManifestVersion,
        record.createdAt,
      ],
    );
  }

  async updateModStatus(
    appId: string,
    modId: string,
    status: ModRecordStatus,
    reasons?: string[],
  ): Promise<ModRecord | null> {
    const { rows } = await this.db.query(
      `UPDATE mod_records
       SET status = $3, reasons = COALESCE($4::jsonb, reasons)
       WHERE app_id = $1 AND mod_id = $2
       RETURNING *`,
      [appId, modId, status, reasons === undefined ? null : JSON.stringify(reasons)],
    );
    const row = rows[0] as ModRow | undefined;
    return row ? toRecord(row) : null;
  }

  async putBundle(appId: string, envelope: SignedEnvelope): Promise<void> {
    // Bundles are immutable: same hash means same bytes, so conflicts are no-ops.
    await this.db.query(
      `INSERT INTO bundles (app_id, content_hash, envelope) VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (app_id, content_hash) DO NOTHING`,
      [appId, envelope.contentHash, JSON.stringify(envelope)],
    );
  }

  async getBundle(appId: string, contentHash: string): Promise<SignedEnvelope | null> {
    const { rows } = await this.db.query(
      `SELECT envelope FROM bundles WHERE app_id = $1 AND content_hash = $2`,
      [appId, contentHash],
    );
    const row = rows[0] as { envelope: SignedEnvelope } | undefined;
    return row?.envelope ?? null;
  }

  async addEvent(event: AnalyticsEvent): Promise<void> {
    await this.db.query(
      `INSERT INTO events (app_id, type, subject_id, mod_id, detail, at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      [
        event.appId,
        event.type,
        event.subjectId ?? null,
        event.modId ?? null,
        event.detail === undefined ? null : JSON.stringify(event.detail),
        event.at,
      ],
    );
  }

  async listEvents(
    appId: string,
    opts: { subjectId?: string; limit?: number } = {},
  ): Promise<AnalyticsEvent[]> {
    const params: unknown[] = [appId];
    let where = `app_id = $1`;
    if (opts.subjectId !== undefined) {
      params.push(opts.subjectId);
      where += ` AND subject_id = $${params.length}`;
    }
    let sql = `SELECT * FROM events WHERE ${where} ORDER BY id`;
    if (opts.limit !== undefined) {
      params.push(opts.limit);
      // Keep the most recent N but return them chronologically.
      sql = `SELECT * FROM (SELECT * FROM events WHERE ${where} ORDER BY id DESC LIMIT $${params.length}) recent ORDER BY id`;
    }
    const { rows } = await this.db.query(sql, params);
    return (rows as EventRow[]).map(toEvent);
  }

  async getDesignConfig(appId: string): Promise<DesignConfig> {
    const { rows } = await this.db.query(
      "SELECT config FROM design_config WHERE app_id = $1",
      [appId],
    );
    const row = rows[0] as { config: DesignConfig } | undefined;
    return row?.config ?? {};
  }

  async putDesignConfig(appId: string, config: DesignConfig): Promise<void> {
    await this.db.query(
      `INSERT INTO design_config (app_id, config) VALUES ($1, $2::jsonb)
       ON CONFLICT (app_id) DO UPDATE SET config = excluded.config`,
      [appId, JSON.stringify(config)],
    );
  }

  private toThemeEntry(row: {
    seq: unknown;
    at: string;
    theme: Record<string, unknown>;
    meta: Record<string, unknown> | null;
  }): ThemeVersionEntry {
    return {
      seq: Number(row.seq),
      at: row.at,
      theme: row.theme,
      ...(row.meta !== null ? { meta: row.meta as ThemeVersionMeta } : {}),
    };
  }

  async appendThemeVersion(
    appId: string,
    userId: string,
    theme: Record<string, unknown>,
    meta?: ThemeVersionMeta,
  ): Promise<ThemeVersionEntry> {
    const at = new Date().toISOString();

    // Atomically allocate the next seq and insert in one shot.
    // An aggregate SELECT with no GROUP BY always returns exactly one row —
    // even when zero rows match the WHERE (MAX is NULL → COALESCE yields 0+1=1),
    // so the very first append for a timeline correctly inserts seq=1.
    const { rows: insertRows } = await this.db.query(
      `INSERT INTO theme_versions (app_id, user_id, seq, at, theme, meta)
       SELECT $1, $2, COALESCE(MAX(seq), 0) + 1, $3, $4::jsonb, $5::jsonb
       FROM theme_versions
       WHERE app_id = $1 AND user_id = $2
       RETURNING seq`,
      [
        appId,
        userId,
        at,
        JSON.stringify(theme),
        meta === undefined ? null : JSON.stringify(meta),
      ],
    );
    const seq = Number((insertRows[0] as { seq: unknown }).seq);

    // Prune to most-recent 50 (separate statement — pruning is not subject to the race).
    await this.db.query(
      `DELETE FROM theme_versions
       WHERE app_id = $1 AND user_id = $2
         AND seq NOT IN (
           SELECT seq FROM theme_versions
           WHERE app_id = $1 AND user_id = $2
           ORDER BY seq DESC LIMIT 50
         )`,
      [appId, userId],
    );

    return {
      seq,
      at,
      theme,
      ...(meta !== undefined ? { meta } : {}),
    };
  }

  async getLatestTheme(
    appId: string,
    userId: string,
  ): Promise<Record<string, unknown> | null> {
    const { rows } = await this.db.query(
      `SELECT theme FROM theme_versions
       WHERE app_id = $1 AND user_id = $2
       ORDER BY seq DESC LIMIT 1`,
      [appId, userId],
    );
    const row = rows[0] as { theme: Record<string, unknown> } | undefined;
    return row?.theme ?? null;
  }

  async listThemeVersions(appId: string, userId: string): Promise<ThemeVersionEntry[]> {
    const { rows } = await this.db.query(
      `SELECT seq, at, theme, meta FROM theme_versions
       WHERE app_id = $1 AND user_id = $2
       ORDER BY seq DESC`,
      [appId, userId],
    );
    return (
      rows as Array<{
        seq: unknown;
        at: string;
        theme: Record<string, unknown>;
        meta: Record<string, unknown> | null;
      }>
    ).map((row) => this.toThemeEntry(row));
  }

  async listThemeTimelines(appId: string): Promise<ThemeTimelineSummary[]> {
    // Join the per-user count with that user's newest row (max seq) so we can
    // surface the latest prompt/source alongside the count + timestamp.
    const { rows } = await this.db.query(
      `SELECT t.user_id, cnt.count, t.at AS latest_at, t.meta AS latest_meta
       FROM theme_versions t
       JOIN (
         SELECT user_id, COUNT(*)::int AS count, MAX(seq) AS max_seq
         FROM theme_versions
         WHERE app_id = $1
         GROUP BY user_id
       ) cnt ON cnt.user_id = t.user_id AND cnt.max_seq = t.seq
       WHERE t.app_id = $1`,
      [appId],
    );
    return (
      rows as Array<{
        user_id: string;
        count: unknown;
        latest_at: string;
        latest_meta: ThemeVersionMeta | null;
      }>
    ).map((row) => ({
      userId: row.user_id,
      count: Number(row.count),
      latestAt: row.latest_at,
      ...(row.latest_meta?.prompt ? { latestPrompt: row.latest_meta.prompt } : {}),
      ...(row.latest_meta?.source ? { latestSource: row.latest_meta.source } : {}),
    }));
  }
}
