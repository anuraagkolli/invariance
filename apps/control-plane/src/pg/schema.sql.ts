/**
 * Control-plane schema, idempotent (IF NOT EXISTS throughout) so `migrate`
 * can run unconditionally at boot. Inline TS rather than a .sql file because
 * workspace packages ship TS source directly — no asset copying.
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS apps (
  app_id text PRIMARY KEY,
  current_manifest_version text
);

CREATE TABLE IF NOT EXISTS manifests (
  app_id text NOT NULL,
  version text NOT NULL,
  manifest jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (app_id, version)
);

CREATE TABLE IF NOT EXISTS mod_records (
  app_id text NOT NULL,
  mod_id text NOT NULL,
  subject_id text NOT NULL,
  revision integer NOT NULL,
  content_hash text NOT NULL,
  envelope jsonb NOT NULL,
  status text NOT NULL,
  prompts jsonb NOT NULL,
  reasons jsonb NOT NULL,
  bound_manifest_version text NOT NULL,
  created_at text NOT NULL,
  seq bigserial,
  PRIMARY KEY (app_id, mod_id)
);
CREATE INDEX IF NOT EXISTS mod_records_by_subject
  ON mod_records (app_id, subject_id, seq);

CREATE TABLE IF NOT EXISTS bundles (
  app_id text NOT NULL,
  content_hash text NOT NULL,
  envelope jsonb NOT NULL,
  PRIMARY KEY (app_id, content_hash)
);

CREATE TABLE IF NOT EXISTS events (
  id bigserial PRIMARY KEY,
  app_id text NOT NULL,
  type text NOT NULL,
  subject_id text,
  mod_id text,
  detail jsonb,
  at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS events_by_app ON events (app_id, id);
CREATE INDEX IF NOT EXISTS events_by_subject ON events (app_id, subject_id, id);

CREATE TABLE IF NOT EXISTS design_config (
  app_id text PRIMARY KEY,
  config jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS theme_versions (
  app_id text NOT NULL,
  user_id text NOT NULL,
  seq bigint NOT NULL,
  at text NOT NULL,
  theme jsonb NOT NULL,
  meta jsonb,
  PRIMARY KEY (app_id, user_id, seq)
);
`;
