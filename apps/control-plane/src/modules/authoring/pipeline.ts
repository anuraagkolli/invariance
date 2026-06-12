import type { SigningKeyPair } from "@invariance/schema/signing";
import { ModBundleSchema, type ModBundle } from "@invariance/schema";
import { z } from "zod";
import type { Store, ModRecord } from "../../store";
import { assembleBundle, publishBundle, RegistryError, type ModDraft } from "../registry";
import { verifyBundleAgainstManifest } from "../verification";
import type { AgentInput, AuthoringAgent } from "./agent";

const DraftShape = z.object({
  uiOps: z.array(z.unknown()).optional(),
  hooks: z.array(z.unknown()).optional(),
  capabilities: z.unknown().optional(),
});

export interface AuthoringResultOk {
  ok: true;
  record: ModRecord;
  attempts: number;
}

export interface AuthoringResultFail {
  ok: false;
  reasons: string[];
  attempts: number;
}

export type AuthoringResult = AuthoringResultOk | AuthoringResultFail;

/** Zod's issue JSON drowns small models; flatten to `path: message` lines. */
function describeError(err: unknown): string {
  if (err instanceof z.ZodError) {
    return err.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
  }
  return (err as Error).message;
}

/**
 * What an op customizes, ignoring its value: a draft that keeps the identity
 * with a different value is a modification, not a drop.
 */
function opIdentities(bundle: ModBundle): Set<string> {
  const ids = new Set<string>();
  for (const op of bundle.uiOps) {
    if (op.type === "token-override") ids.add(`token ${op.token}`);
    else if (op.type === "style-rule") ids.add(`style rule for "${op.selector}"`);
    else ids.add(`slot ${op.componentId}.${op.slot}`);
  }
  for (const hook of bundle.hooks) {
    ids.add(`hook on ${hook.trigger.endpointId} (${hook.trigger.phase})`);
  }
  return ids;
}

export interface AuthorModParams {
  store: Store;
  keys: SigningKeyPair;
  agent: AuthoringAgent;
  appId: string;
  subjectId: string;
  prompt: string;
  /** Extra verifier feedback seeded into the first attempt (used by re-fix). */
  seedFeedback?: string[];
  /**
   * What to store as the new record's prompt history. Defaults to the
   * subject's existing prompts plus `prompt`; re-fix overrides this so its
   * synthetic instruction never pollutes the user's real prompt trail.
   */
  recordPrompts?: string[];
  maxAttempts?: number;
}

/**
 * Verifier-in-the-loop authoring: generate -> assemble -> verify -> repair.
 * Nothing the agent produces is trusted; only bundles that clear the
 * deterministic verifier are ever signed and published.
 */
export async function authorMod(params: AuthorModParams): Promise<AuthoringResult> {
  const { store, keys, agent, appId, subjectId, prompt } = params;
  const maxAttempts = params.maxAttempts ?? 3;
  const manifest = await store.currentManifest(appId);
  if (!manifest) throw new RegistryError(`app ${appId} has no published manifest`, 404);

  const current = await store.latestMod(appId, subjectId);
  const currentBundle = current ? ModBundleSchema.parse(JSON.parse(current.envelope.payload)) : null;

  let feedback: string[] = params.seedFeedback ?? [];
  /** Ops the previous attempt was warned about dropping (null = no warning). */
  let pendingDropConfirmation: string[] | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const priorDropWarning: string[] | null = pendingDropConfirmation;
    pendingDropConfirmation = null;
    const input: AgentInput = { prompt, manifest, currentBundle, feedback };
    let draft: ModDraft;
    try {
      const raw = DraftShape.parse(await agent.generateDraft(input));
      draft = raw as ModDraft;
    } catch (err) {
      feedback = [`draft was not valid JSON of the expected shape: ${describeError(err)}`];
      continue;
    }

    let bundle;
    try {
      bundle = await assembleBundle(store, appId, subjectId, draft);
    } catch (err) {
      feedback = [`draft failed schema validation: ${describeError(err)}`];
      continue;
    }

    const verdict = verifyBundleAgainstManifest(bundle, manifest);
    if (!verdict.ok) {
      feedback = verdict.reasons;
      continue;
    }

    // A draft identical to the current modset verified — but implemented
    // nothing. The verifier can't see intent, so the pipeline rejects no-ops.
    // Skipped for re-fix (seedFeedback), where reproducing the old modset
    // under the new manifest can be exactly right.
    if (
      currentBundle &&
      !params.seedFeedback &&
      JSON.stringify({ u: bundle.uiOps, h: bundle.hooks, c: bundle.capabilities }) ===
        JSON.stringify({ u: currentBundle.uiOps, h: currentBundle.hooks, c: currentBundle.capabilities })
    ) {
      feedback = [
        "your draft is identical to the current modset — the new request was not implemented; change the modset to satisfy it",
      ];
      continue;
    }

    // Models routinely answer with only the new request's ops, silently
    // dropping the user's existing customizations. A dropping draft is
    // rejected with the missing ops named; the drop is accepted only when the
    // immediately preceding rejection was this same warning and the model
    // still omitted them (intentional removal). Skipped for re-fix, where the
    // degraded modset legitimately loses ops the new manifest no longer
    // supports.
    if (currentBundle && !params.seedFeedback) {
      const draftIds = opIdentities(bundle);
      const dropped = [...opIdentities(currentBundle)].filter((id) => !draftIds.has(id));
      const warnedIds: Set<string> = new Set(priorDropWarning ?? []);
      const confirmedRemoval: boolean =
        priorDropWarning !== null && dropped.every((id: string): boolean => warnedIds.has(id));
      if (dropped.length > 0 && !confirmedRemoval) {
        pendingDropConfirmation = dropped;
        feedback = [
          `your draft dropped existing customizations the request did not ask to remove: ${dropped.join(
            ", ",
          )} — start from the current modset and apply the new request on top, keeping every other op; resubmit without them only if the user explicitly asked for their removal`,
        ];
        continue;
      }
    }

    const prompts = params.recordPrompts ?? [...(current?.prompts ?? []), prompt];
    const record = await publishBundle(store, keys, bundle, prompts);
    await store.addEvent({
      type: "mod_authored",
      appId,
      subjectId,
      modId: record.modId,
      detail: { attempts: attempt, prompt },
      at: Date.now(),
    });
    return { ok: true, record, attempts: attempt };
  }

  await store.addEvent({
    type: "mod_rejected",
    appId,
    subjectId,
    detail: { prompt, reasons: feedback },
    at: Date.now(),
  });
  return { ok: false, reasons: feedback, attempts: maxAttempts };
}

export interface RefixModParams {
  store: Store;
  keys: SigningKeyPair;
  agent: AuthoringAgent;
  appId: string;
  subjectId: string;
  maxAttempts?: number;
}

/**
 * AI re-fix for a degraded modset: re-author the user's customizations from
 * their original prompt history against the *current* manifest, seeding the
 * degrade reasons as first-attempt verifier feedback. The synthetic
 * instruction is never stored as a user prompt.
 */
export async function refixMod(params: RefixModParams): Promise<AuthoringResult> {
  const { store, appId, subjectId } = params;
  const degraded = await store.latestMod(appId, subjectId);
  if (!degraded || degraded.status !== "degraded") {
    throw new RegistryError(`subject ${subjectId} has no degraded mod to fix`, 409);
  }
  const prompt =
    "Recreate the user's customizations under the new manifest. " +
    `Original requests, in order: ${degraded.prompts.map((p) => JSON.stringify(p)).join("; ")}`;
  const result = await authorMod({
    ...params,
    prompt,
    seedFeedback: degraded.reasons,
    recordPrompts: degraded.prompts,
  });
  if (result.ok) {
    await store.addEvent({
      type: "mod_refixed",
      appId,
      subjectId,
      modId: result.record.modId,
      detail: { attempts: result.attempts },
      at: Date.now(),
    });
  }
  return result;
}
