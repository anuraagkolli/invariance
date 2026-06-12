import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import {
  CapabilityManifestSchema,
  HookModuleSchema,
  UiOpSchema,
} from "@invariance/schema";
import type { SigningKeyPair } from "@invariance/schema/signing";
import { loadKeys } from "./keys";
import type { AuthoringAgent } from "./modules/authoring/agent";
import { AnthropicAgent } from "./modules/authoring/anthropic";
import { OpenAiCompatAgent } from "./modules/authoring/openai-compat";
import { modAdminView, modDetailView, summarizeApp } from "./modules/analytics";
import { authorMod, refixMod } from "./modules/authoring/pipeline";
import {
  assembleBundle,
  getPointer,
  publishBundle,
  publishManifest,
  RegistryError,
  revalidateSubject,
  setModStatus,
} from "./modules/registry";
import { verifyBundleAgainstManifest } from "./modules/verification";
import { MemoryStore, type Store } from "./store";

export interface ControlPlaneOptions {
  store?: Store;
  keys?: SigningKeyPair;
  /**
   * Authoring agent. Defaults to OpenAiCompatAgent when
   * INVARIANCE_LLM_BASE_URL is set (Ollama/vLLM/OpenRouter), else
   * AnthropicAgent when ANTHROPIC_API_KEY is set.
   */
  agent?: AuthoringAgent;
  /** Verifier-in-the-loop repair attempts per prompt (default 3; local models want ~5). */
  maxAuthoringAttempts?: number;
}

function defaultAgent(): AuthoringAgent | null {
  if (process.env.INVARIANCE_LLM_BASE_URL) return new OpenAiCompatAgent();
  if (process.env.ANTHROPIC_API_KEY) return new AnthropicAgent();
  return null;
}

export const ModDraftSchema = z.object({
  uiOps: z.array(UiOpSchema).optional(),
  hooks: z.array(HookModuleSchema).optional(),
  capabilities: CapabilityManifestSchema.optional(),
});

export interface ControlPlane {
  app: Hono;
  store: Store;
  keys: SigningKeyPair;
}

export function createControlPlane(options: ControlPlaneOptions = {}): ControlPlane {
  const store = options.store ?? new MemoryStore();
  const keys = options.keys ?? loadKeys();
  const agent = options.agent ?? defaultAgent();
  const maxAttempts =
    options.maxAuthoringAttempts ??
    (Number(process.env.INVARIANCE_AUTHORING_MAX_ATTEMPTS) || undefined);
  const app = new Hono();

  app.use("*", cors());

  app.onError((err, c) => {
    if (err instanceof RegistryError) {
      return c.json({ error: err.message }, err.status as 400);
    }
    if (err instanceof z.ZodError) {
      return c.json({ error: "validation failed", issues: err.issues }, 400);
    }
    console.error(err);
    return c.json({ error: "internal error" }, 500);
  });

  app.get("/healthz", (c) => c.json({ ok: true }));

  app.get("/v1/apps/:appId/signing-key", (c) =>
    c.json({ publicKeyPem: keys.publicKeyPem, keyId: keys.keyId }),
  );

  app.post("/v1/apps/:appId/manifest", async (c) => {
    const result = await publishManifest(store, c.req.param("appId"), await c.req.json());
    return c.json(
      { version: result.manifest.version, staleMods: result.staleCount },
      201,
    );
  });

  app.get("/v1/apps/:appId/manifest", async (c) => {
    const manifest = await store.currentManifest(c.req.param("appId"));
    if (!manifest) return c.json({ error: "no manifest published" }, 404);
    return c.json(manifest);
  });

  /**
   * Developer/dev-tooling bundle publish (used by seeds and the CLI dev
   * loop). End-user mods go through the authoring pipeline instead.
   */
  app.post("/v1/apps/:appId/subjects/:subjectId/bundles", async (c) => {
    const appId = c.req.param("appId");
    const draft = ModDraftSchema.parse(await c.req.json());
    const bundle = await assembleBundle(store, appId, c.req.param("subjectId"), draft);
    const manifest = (await store.currentManifest(appId))!;
    const verdict = verifyBundleAgainstManifest(bundle, manifest);
    if (!verdict.ok) {
      return c.json({ error: "verification failed", reasons: verdict.reasons }, 422);
    }
    const record = await publishBundle(store, keys, bundle, []);
    return c.json({ modId: record.modId, contentHash: record.contentHash }, 201);
  });

  /** End-user authoring: natural-language prompt -> verified, signed bundle. */
  app.post("/v1/apps/:appId/subjects/:subjectId/prompts", async (c) => {
    if (!agent) {
      return c.json({ error: "authoring agent not configured" }, 503);
    }
    const { prompt } = z.object({ prompt: z.string().min(1).max(2000) }).parse(await c.req.json());
    const result = await authorMod({
      store,
      keys,
      agent,
      appId: c.req.param("appId"),
      subjectId: c.req.param("subjectId"),
      prompt,
      maxAttempts,
    });
    if (!result.ok) {
      return c.json({ error: "verification failed", reasons: result.reasons }, 422);
    }
    return c.json(
      {
        modId: result.record.modId,
        contentHash: result.record.contentHash,
        attempts: result.attempts,
      },
      201,
    );
  });

  app.get("/v1/apps/:appId/subjects/:subjectId/pointer", async (c) =>
    c.json(await getPointer(store, c.req.param("appId"), c.req.param("subjectId"))),
  );

  /** Lazy migration: re-verify a stale modset against the current manifest. */
  app.post("/v1/apps/:appId/subjects/:subjectId/revalidate", async (c) =>
    c.json(await revalidateSubject(store, keys, c.req.param("appId"), c.req.param("subjectId"))),
  );

  /** AI repair of a degraded modset from the subject's original prompts. */
  app.post("/v1/apps/:appId/subjects/:subjectId/refix", async (c) => {
    if (!agent) {
      return c.json({ error: "authoring agent not configured" }, 503);
    }
    const result = await refixMod({
      store,
      keys,
      agent,
      appId: c.req.param("appId"),
      subjectId: c.req.param("subjectId"),
      maxAttempts,
    });
    if (!result.ok) {
      return c.json({ error: "re-fix failed verification", reasons: result.reasons }, 422);
    }
    return c.json(
      {
        modId: result.record.modId,
        contentHash: result.record.contentHash,
        attempts: result.attempts,
      },
      201,
    );
  });

  /**
   * Client/server telemetry ingestion. sendBeacon posts without a JSON
   * content-type, so the body is parsed leniently; bad events are dropped,
   * never errored — telemetry must stay invisible to the host app.
   */
  app.post("/v1/apps/:appId/events", async (c) => {
    const appId = c.req.param("appId");
    let parsed: unknown;
    try {
      parsed = JSON.parse(await c.req.text());
    } catch {
      return c.json({ accepted: false }, 202);
    }
    const event = z
      .object({
        type: z.string().min(1).max(64),
        subjectId: z.string().max(256).optional(),
        modId: z.string().max(256).optional(),
        detail: z.record(z.unknown()).optional(),
      })
      .safeParse(parsed);
    if (!event.success) return c.json({ accepted: false }, 202);
    await store.addEvent({ ...event.data, appId, at: Date.now() });
    return c.json({ accepted: true }, 202);
  });

  app.get("/v1/apps/:appId/analytics/summary", async (c) =>
    c.json(await summarizeApp(store, c.req.param("appId"))),
  );

  /** Mods admin: every record (envelope payloads excluded) with classification. */
  app.get("/v1/apps/:appId/mods", async (c) =>
    c.json({ mods: (await store.allMods(c.req.param("appId"))).map(modAdminView) }),
  );

  /**
   * Per-subject drill-down for the console: pointer state, full revision
   * history (with bundle contents), and this subject's recent telemetry.
   */
  app.get("/v1/apps/:appId/subjects/:subjectId/overview", async (c) => {
    const appId = c.req.param("appId");
    const subjectId = c.req.param("subjectId");
    const mods = [...(await store.subjectMods(appId, subjectId))].reverse().map(modDetailView);
    const events = (await store.listEvents(appId, { subjectId, limit: 50 })).reverse();
    return c.json({
      subjectId,
      pointer: await getPointer(store, appId, subjectId),
      mods,
      events,
    });
  });

  /** Developer kill switch: propagates via the subject's pointer within its TTL. */
  app.post("/v1/apps/:appId/mods/:modId/kill", async (c) => {
    const appId = c.req.param("appId");
    const record = await setModStatus(store, appId, c.req.param("modId"), "disabled");
    await store.addEvent({
      type: "mod_killed",
      appId,
      subjectId: record.subjectId,
      modId: record.modId,
      at: Date.now(),
    });
    return c.json(modAdminView(record));
  });

  app.post("/v1/apps/:appId/mods/:modId/restore", async (c) => {
    const appId = c.req.param("appId");
    const record = await setModStatus(store, appId, c.req.param("modId"), "active");
    await store.addEvent({
      type: "mod_restored",
      appId,
      subjectId: record.subjectId,
      modId: record.modId,
      at: Date.now(),
    });
    return c.json(modAdminView(record));
  });

  app.get("/v1/apps/:appId/bundles/:hash", async (c) => {
    const envelope = await store.getBundle(c.req.param("appId"), c.req.param("hash"));
    if (!envelope) return c.json({ error: "bundle not found" }, 404);
    c.header("cache-control", "public, max-age=31536000, immutable");
    return c.json(envelope);
  });

  return { app, store, keys };
}
