import {
  AppManifestSchema,
  ModBundleSchema,
  type AppManifest,
  type CapabilityManifest,
  type HookModule,
  type ModBundle,
  type UiOp,
} from "@invariance/schema";
import { signBundle, type SigningKeyPair } from "@invariance/schema/signing";
import { randomUUID } from "node:crypto";
import type { MemoryStore, ModRecord } from "../store";
import { verifyBundleAgainstManifest } from "./verification";

export interface ModDraft {
  uiOps?: UiOp[];
  hooks?: HookModule[];
  capabilities?: CapabilityManifest;
}

export interface PointerView {
  status: "active" | "stale" | "degraded" | "disabled" | "none";
  contentHash?: string;
  reasons?: string[];
}

export class RegistryError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = "RegistryError";
  }
}

/**
 * Publishing a manifest version is the "developer release" moment: every
 * subject's active mod bound to an older version becomes stale and will be
 * lazily revalidated on that subject's next session.
 */
export function publishManifest(
  store: MemoryStore,
  appId: string,
  manifestInput: unknown,
): { manifest: AppManifest; staleCount: number } {
  const manifest = AppManifestSchema.parse(manifestInput);
  if (manifest.appId !== appId) {
    throw new RegistryError(`manifest appId ${manifest.appId} does not match route ${appId}`);
  }
  const state = store.app(appId);
  state.manifests.set(manifest.version, manifest);
  state.currentManifestVersion = manifest.version;

  let staleCount = 0;
  for (const mods of state.modsBySubject.values()) {
    for (const mod of mods) {
      if (mod.status === "active" && mod.boundManifestVersion !== manifest.version) {
        mod.status = "stale";
        staleCount++;
      }
    }
  }
  return { manifest, staleCount };
}

/** Builds a full ModBundle from a draft, assigning identity and binding. */
export function assembleBundle(
  store: MemoryStore,
  appId: string,
  subjectId: string,
  draft: ModDraft,
): ModBundle {
  const manifest = store.currentManifest(appId);
  if (!manifest) throw new RegistryError(`app ${appId} has no published manifest`, 404);
  const latest = store.latestMod(appId, subjectId);
  return ModBundleSchema.parse({
    id: `mod_${randomUUID()}`,
    appId,
    subjectId,
    revision: (latest?.revision ?? -1) + 1,
    binding: { appManifestVersion: manifest.version },
    uiOps: draft.uiOps ?? [],
    hooks: draft.hooks ?? [],
    capabilities: draft.capabilities ?? { reads: [], writes: [], budgets: { cpuMs: 50, memMb: 32 } },
    createdAt: new Date().toISOString(),
  });
}

/** Signs and stores a verified bundle, superseding the subject's previous revision. */
export function publishBundle(
  store: MemoryStore,
  keys: SigningKeyPair,
  bundle: ModBundle,
  prompts: string[],
): ModRecord {
  const envelope = signBundle(bundle, keys.privateKeyPem, keys.keyId);
  const state = store.app(bundle.appId);
  const mods = store.subjectMods(bundle.appId, bundle.subjectId);

  const previous = store.latestMod(bundle.appId, bundle.subjectId);
  if (
    previous &&
    (previous.status === "active" || previous.status === "stale" || previous.status === "degraded")
  ) {
    previous.status = "superseded";
  }

  const record: ModRecord = {
    modId: bundle.id,
    appId: bundle.appId,
    subjectId: bundle.subjectId,
    revision: bundle.revision,
    contentHash: envelope.contentHash,
    envelope,
    status: "active",
    prompts,
    reasons: [],
    boundManifestVersion: bundle.binding.appManifestVersion,
    createdAt: bundle.createdAt,
  };
  mods.push(record);
  state.bundlesByHash.set(envelope.contentHash, envelope);
  return record;
}

export function getPointer(store: MemoryStore, appId: string, subjectId: string): PointerView {
  const mod = store.latestMod(appId, subjectId);
  if (!mod) return { status: "none" };
  switch (mod.status) {
    case "active":
    case "stale":
      return { status: mod.status, contentHash: mod.contentHash };
    case "degraded":
      return { status: "degraded", reasons: mod.reasons };
    case "disabled":
      return { status: "disabled" };
    default:
      return { status: "none" };
  }
}

/**
 * Lazy migration, triggered by the subject's next session after a developer
 * release: rebind the stale bundle to the current manifest and re-run the
 * full deterministic verifier. Pass -> re-signed new revision (prompts carry
 * forward), pointer active again. Fail -> the record degrades with the
 * verifier's reasons and the client offers the AI re-fix path.
 */
export function revalidateSubject(
  store: MemoryStore,
  keys: SigningKeyPair,
  appId: string,
  subjectId: string,
): PointerView {
  const mod = store.latestMod(appId, subjectId);
  if (!mod || mod.status !== "stale") return getPointer(store, appId, subjectId);
  const manifest = store.currentManifest(appId);
  if (!manifest) return getPointer(store, appId, subjectId);

  const stale = ModBundleSchema.parse(JSON.parse(mod.envelope.payload));
  const rebound = assembleBundle(store, appId, subjectId, {
    uiOps: stale.uiOps,
    hooks: stale.hooks,
    capabilities: stale.capabilities,
  });
  const verdict = verifyBundleAgainstManifest(rebound, manifest);
  if (!verdict.ok) {
    mod.status = "degraded";
    mod.reasons = verdict.reasons;
    store.app(appId).events.push({
      type: "mod_degraded",
      appId,
      subjectId,
      modId: mod.modId,
      detail: { manifestVersion: manifest.version, reasons: verdict.reasons },
      at: Date.now(),
    });
    return { status: "degraded", reasons: verdict.reasons };
  }

  const record = publishBundle(store, keys, rebound, mod.prompts);
  store.app(appId).events.push({
    type: "mod_migrated",
    appId,
    subjectId,
    modId: record.modId,
    detail: { from: mod.boundManifestVersion, to: manifest.version },
    at: Date.now(),
  });
  return { status: "active", contentHash: record.contentHash };
}

export function setModStatus(
  store: MemoryStore,
  appId: string,
  modId: string,
  status: "disabled" | "active",
): ModRecord {
  const mod = store.findMod(appId, modId);
  if (!mod) throw new RegistryError(`mod ${modId} not found`, 404);
  mod.status = status;
  return mod;
}
