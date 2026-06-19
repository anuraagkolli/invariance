import type { ThemeArtifact, Pointer, StyleSpec, Verdict } from "@invariance/theming";
import { hashArtifact } from "@invariance/theming";
import type { BlobStore, PointerStore, AuditStore, AuditRow } from "./stores.js";

export type PublishStores = { blob: BlobStore; pointer: PointerStore; audit: AuditStore };

export type PublishInput = {
  tenant: string;
  artifact: ThemeArtifact;
  styleSpec: StyleSpec;
  verifierReport: Verdict; // must be { ok: true } — publish refuses a failed verdict
  prompt: string;
  actor: string;
  vocabVersion: string;
  profileVersion: string;
};

export type PublishResult = { hash: string; pointer: Pointer };

// Timestamps are stamped OUTSIDE the pure core; injectable for deterministic tests.
// Optional trailing arg (ledger §9.3 widening): a ledger-shaped caller omits it.
export type Clock = { now?: () => string };
const isoNow = (clock?: Clock): string => (clock?.now ?? (() => new Date().toISOString()))();

// Write order is load-bearing (§9): artifact to blob FIRST → flip pointer → record audit LAST.
// A crash between steps never leaves a pointer to a missing artifact.
export async function publish(input: PublishInput, stores: PublishStores, clock?: Clock): Promise<PublishResult> {
  if (!input.verifierReport.ok) {
    throw new Error("publish refused: verifier verdict is not { ok: true }");
  }
  const hash = hashArtifact(input.artifact);
  const timestamp = isoNow(clock);

  // 1) blob FIRST (content-addressed, idempotent).
  await stores.blob.putArtifact(hash, input.artifact);

  // 2) flip the pointer live.
  const pointer: Pointer = { hash, status: "live", updatedAt: timestamp };
  await stores.pointer.putPointer(input.tenant, pointer);

  // 3) record the audit row LAST (the governance product + functional read path).
  const row: AuditRow = {
    tenant: input.tenant,
    hash,
    prompt: input.prompt,
    styleSpec: input.styleSpec,
    verifierReport: input.verifierReport,
    actor: input.actor,
    timestamp,
    vocabVersion: input.vocabVersion,
    profileVersion: input.profileVersion,
  };
  await stores.audit.recordAudit(row);

  return { hash, pointer };
}

// Kill-switch is also a pointer write (§7.3). Preserves the hash; flips status.
export async function setKillSwitch(
  tenant: string,
  status: "live" | "disabled",
  pointer: PointerStore,
  clock?: Clock,
): Promise<Pointer> {
  const existing = await pointer.getPointer(tenant);
  if (!existing) {
    throw new Error(`setKillSwitch: no pointer for tenant "${tenant}"`);
  }
  const next: Pointer = { hash: existing.hash, status, updatedAt: isoNow(clock) };
  await pointer.putPointer(tenant, next);
  return next;
}
