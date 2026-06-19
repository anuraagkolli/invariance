import type { AuditStore, AuditRow } from "./stores.js";

export type VersionRef = { vocabVersions: Set<string>; profileVersions: Set<string> };

type AuditReadable = AuditStore & { listAudits(): AuditRow[] };

// Every vocab + profile version stamped in any stored spec. These are the versions
// retention must keep alive (§9): reset/recompile recompiles a stamped spec against ITS versions.
export function referencedVersions(audit: AuditReadable): VersionRef {
  const vocabVersions = new Set<string>();
  const profileVersions = new Set<string>();
  for (const row of audit.listAudits()) {
    vocabVersions.add(row.vocabVersion);
    profileVersions.add(row.profileVersion);
  }
  return { vocabVersions, profileVersions };
}

// The append-only-while-referenced invariant (§9): a graph/profile version may NEVER be deleted
// while any stored StyleSpec references it (else a reset becomes a miscompile-or-crash).
export function assertRetained(
  toDelete: { vocabVersion?: string; profileVersion?: string },
  audit: AuditReadable,
): void {
  const refs = referencedVersions(audit);
  if (toDelete.vocabVersion !== undefined && refs.vocabVersions.has(toDelete.vocabVersion)) {
    throw new Error(`retention: vocabVersion "${toDelete.vocabVersion}" is still referenced by a stored spec`);
  }
  if (toDelete.profileVersion !== undefined && refs.profileVersions.has(toDelete.profileVersion)) {
    throw new Error(`retention: profileVersion "${toDelete.profileVersion}" is still referenced by a stored spec`);
  }
}
