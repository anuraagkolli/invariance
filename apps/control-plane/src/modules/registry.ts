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
import type { Store, ModRecord } from "../store";
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
export async function publishManifest(
  store: Store,
  appId: string,
  manifestInput: unknown,
): Promise<{ manifest: AppManifest; staleCount: number }> {
  const manifest = AppManifestSchema.parse(manifestInput);
  if (manifest.appId !== appId) {
    throw new RegistryError(`manifest appId ${manifest.appId} does not match route ${appId}`);
  }
  await store.putManifest(appId, manifest);
  const staleCount = await store.markActiveModsStale(appId, manifest.version);
  return { manifest, staleCount };
}

/** Builds a full ModBundle from a draft, assigning identity and binding. */
export async function assembleBundle(
  store: Store,
  appId: string,
  subjectId: string,
  draft: ModDraft,
): Promise<ModBundle> {
  const manifest = await store.currentManifest(appId);
  if (!manifest) throw new RegistryError(`app ${appId} has no published manifest`, 404);
  const latest = await store.latestMod(appId, subjectId);
  return ModBundleSchema.parse({
    id: `mod_${randomUUID()}`,
    appId,
    subjectId,
    revision: (latest?.revision ?? -1) + 1,
    binding: { appManifestVersion: manifest.version },
    uiOps: draft.uiOps ?? [],
    hooks: draft.hooks ?? [],
    // Models get the reads/writes themselves right far more often than the
    // boilerplate around them; missing lists and budgets get safe defaults
    // (the verifier still enforces policy caps on whatever lands here).
    capabilities: {
      reads: [],
      writes: [],
      ...(draft.capabilities ?? {}),
      budgets: { cpuMs: 50, memMb: 32, ...(draft.capabilities?.budgets ?? {}) },
    },
    createdAt: new Date().toISOString(),
  });
}

/** Signs and stores a verified bundle, superseding the subject's previous revision. */
export async function publishBundle(
  store: Store,
  keys: SigningKeyPair,
  bundle: ModBundle,
  prompts: string[],
): Promise<ModRecord> {
  const envelope = signBundle(bundle, keys.privateKeyPem, keys.keyId);

  const previous = await store.latestMod(bundle.appId, bundle.subjectId);
  if (
    previous &&
    (previous.status === "active" || previous.status === "stale" || previous.status === "degraded")
  ) {
    await store.updateModStatus(bundle.appId, previous.modId, "superseded");
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
  await store.insertMod(record);
  await store.putBundle(bundle.appId, envelope);
  return record;
}

export async function getPointer(
  store: Store,
  appId: string,
  subjectId: string,
): Promise<PointerView> {
  const mod = await store.latestMod(appId, subjectId);
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
export async function revalidateSubject(
  store: Store,
  keys: SigningKeyPair,
  appId: string,
  subjectId: string,
): Promise<PointerView> {
  const mod = await store.latestMod(appId, subjectId);
  if (!mod || mod.status !== "stale") return getPointer(store, appId, subjectId);
  const manifest = await store.currentManifest(appId);
  if (!manifest) return getPointer(store, appId, subjectId);

  const stale = ModBundleSchema.parse(JSON.parse(mod.envelope.payload));
  const rebound = await assembleBundle(store, appId, subjectId, {
    uiOps: stale.uiOps,
    hooks: stale.hooks,
    capabilities: stale.capabilities,
  });
  const verdict = verifyBundleAgainstManifest(rebound, manifest);
  if (!verdict.ok) {
    await store.updateModStatus(appId, mod.modId, "degraded", verdict.reasons);
    await store.addEvent({
      type: "mod_degraded",
      appId,
      subjectId,
      modId: mod.modId,
      detail: { manifestVersion: manifest.version, reasons: verdict.reasons },
      at: Date.now(),
    });
    return { status: "degraded", reasons: verdict.reasons };
  }

  const record = await publishBundle(store, keys, rebound, mod.prompts);
  await store.addEvent({
    type: "mod_migrated",
    appId,
    subjectId,
    modId: record.modId,
    detail: { from: mod.boundManifestVersion, to: manifest.version },
    at: Date.now(),
  });
  return { status: "active", contentHash: record.contentHash };
}

/**
 * Developer kill switch / restore. Superseded history is immutable: flipping
 * an old revision's status would make it the subject's "latest non-superseded"
 * record and corrupt pointer resolution.
 */
export async function setModStatus(
  store: Store,
  appId: string,
  modId: string,
  status: "disabled" | "active",
): Promise<ModRecord> {
  const mod = await store.findMod(appId, modId);
  if (!mod) throw new RegistryError(`mod ${modId} not found`, 404);
  if (mod.status === "superseded") {
    throw new RegistryError(`mod ${modId} is superseded history and cannot change status`, 409);
  }
  if (status === "active" && mod.status !== "disabled") {
    throw new RegistryError(`mod ${modId} is ${mod.status}; only disabled mods can be restored`, 409);
  }
  const updated = await store.updateModStatus(appId, modId, status);
  if (!updated) throw new RegistryError(`mod ${modId} not found`, 404);
  return updated;
}
