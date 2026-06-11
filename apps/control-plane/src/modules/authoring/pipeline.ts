import type { SigningKeyPair } from "@invariance/schema/signing";
import { ModBundleSchema } from "@invariance/schema";
import { z } from "zod";
import type { MemoryStore, ModRecord } from "../../store";
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

export interface AuthorModParams {
  store: MemoryStore;
  keys: SigningKeyPair;
  agent: AuthoringAgent;
  appId: string;
  subjectId: string;
  prompt: string;
  /** Extra verifier feedback seeded into the first attempt (used by re-fix). */
  seedFeedback?: string[];
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
  const manifest = store.currentManifest(appId);
  if (!manifest) throw new RegistryError(`app ${appId} has no published manifest`, 404);

  const current = store.latestMod(appId, subjectId);
  const currentBundle = current ? ModBundleSchema.parse(JSON.parse(current.envelope.payload)) : null;

  let feedback: string[] = params.seedFeedback ?? [];
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const input: AgentInput = { prompt, manifest, currentBundle, feedback };
    let draft: ModDraft;
    try {
      const raw = DraftShape.parse(await agent.generateDraft(input));
      draft = raw as ModDraft;
    } catch (err) {
      feedback = [`draft was not valid JSON of the expected shape: ${(err as Error).message}`];
      continue;
    }

    let bundle;
    try {
      bundle = assembleBundle(store, appId, subjectId, draft);
    } catch (err) {
      feedback = [`draft failed schema validation: ${(err as Error).message}`];
      continue;
    }

    const verdict = verifyBundleAgainstManifest(bundle, manifest);
    if (!verdict.ok) {
      feedback = verdict.reasons;
      continue;
    }

    const prompts = [...(current?.prompts ?? []), prompt];
    const record = publishBundle(store, keys, bundle, prompts);
    store.app(appId).events.push({
      type: "mod_authored",
      appId,
      subjectId,
      modId: record.modId,
      detail: { attempts: attempt, prompt },
      at: Date.now(),
    });
    return { ok: true, record, attempts: attempt };
  }

  store.app(appId).events.push({
    type: "mod_rejected",
    appId,
    subjectId,
    detail: { prompt, reasons: feedback },
    at: Date.now(),
  });
  return { ok: false, reasons: feedback, attempts: maxAttempts };
}
