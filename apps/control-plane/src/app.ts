import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import {
  CapabilityManifestSchema,
  DesignConfigSchema,
  HookModuleSchema,
  UiOpSchema,
} from "@invariance/schema";
import type { SigningKeyPair } from "@invariance/schema/signing";
import { loadKeys } from "./keys";
import type { AuthoringAgent } from "./modules/authoring/agent";
import { AnthropicAgent } from "./modules/authoring/anthropic";
import { OpenAiCompatAgent } from "./modules/authoring/openai-compat";
import {
  createDesignAwareAgent,
  type ThemeClassifier,
  type ThemeDesigner,
} from "./modules/authoring/design-author";
import { callDesigner } from "@invariance/design/server";
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
  /**
   * Inject the design path (classify + Designer) directly — used by tests and
   * advanced hosts. When omitted, the live path is wired automatically from env
   * (a keyword classifier + callDesigner) whenever a design API key is set.
   */
  designAuthoring?: { classify: ThemeClassifier; design: ThemeDesigner };
}

function defaultAgent(): AuthoringAgent | null {
  if (process.env.INVARIANCE_LLM_BASE_URL) return new OpenAiCompatAgent();
  if (process.env.ANTHROPIC_API_KEY) return new AnthropicAgent();
  return null;
}

// Deterministic theme classifier: routes look/vibe prompts to the design path,
// everything else to the base authoring agent. (A future phase can upgrade this
// to the Gatekeeper LLM for nuanced intent; this keyword gate needs no key.)
const THEME_WORDS =
  /\b(theme|look|vibe|style|styl(e|ing)|aesthetic|colou?r|accent|palette|dark|light|mode|font|typography|retro|brutal(ist)?|pastel|minimal|modern|warm|cool|moody|bright|tone|brand|rounded|sharp)\b/i;
const keywordClassify: ThemeClassifier = (input) => THEME_WORDS.test(input.prompt);

/**
 * Build the design path from env. The Designer is a live LLM call, so this
 * activates when EITHER an OpenAI-compatible base URL is set (Ollama/qwen — the
 * default, no key needed) OR an Anthropic key is set. The classifier is
 * deterministic. Env:
 *   INVARIANCE_DESIGN_BASE_URL  (or INVARIANCE_LLM_BASE_URL) e.g. http://localhost:11434/v1
 *   INVARIANCE_DESIGN_MODEL     (or INVARIANCE_LLM_MODEL)    e.g. qwen2.5:latest
 *   INVARIANCE_DESIGN_PROVIDER  anthropic | openai-compatible (inferred from base URL)
 *   INVARIANCE_DESIGN_API_KEY   (or ANTHROPIC_API_KEY)       only for Anthropic
 */
function designAuthoringFromEnv(): { classify: ThemeClassifier; design: ThemeDesigner } | null {
  const baseUrl = process.env.INVARIANCE_DESIGN_BASE_URL ?? process.env.INVARIANCE_LLM_BASE_URL;
  const apiKey = process.env.INVARIANCE_DESIGN_API_KEY ?? process.env.ANTHROPIC_API_KEY;
  if (!baseUrl && !apiKey) return null;
  const provider = (process.env.INVARIANCE_DESIGN_PROVIDER ??
    (baseUrl ? "openai-compatible" : "anthropic")) as "anthropic" | "openai-compatible";
  const model = process.env.INVARIANCE_DESIGN_MODEL ?? process.env.INVARIANCE_LLM_MODEL;
  // Local models reject native json_schema enforcement; ask for a bare JSON
  // object and let the Designer's zod-revalidate + retry loop pin the shape.
  const oaiStructuredMode =
    provider === "openai-compatible" ? ("json_object" as const) : undefined;
  const design: ThemeDesigner = async (input) => {
    const result = await callDesigner({
      request: input.request,
      constraints: input.constraints,
      apiKey: apiKey ?? process.env.INVARIANCE_LLM_API_KEY ?? "",
      provider,
      ...(input.currentSpec ? { currentSpec: input.currentSpec } : {}),
      ...(baseUrl ? { baseUrl } : {}),
      ...(model ? { model } : {}),
      ...(oaiStructuredMode ? { oaiStructuredMode } : {}),
    });
    if (!result.ok) throw new Error(`designer failed: ${result.error}`);
    return result.spec;
  };
  return { classify: keywordClassify, design };
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
  let agent = options.agent ?? defaultAgent();
  // Wrap the base agent so theme prompts route through the design engine
  // (Designer StyleSpec -> compiler -> token-override ops). Injected deps win;
  // otherwise the live path is built from env when a design key is present.
  const design = options.designAuthoring ?? designAuthoringFromEnv();
  if (agent && design) {
    agent = createDesignAwareAgent(agent, design);
  }
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

  /**
   * Recent activity feed across all subjects of an app, newest-first — the
   * data source for the console's live Guardrails enforcement feed.
   * `store.listEvents` is chronological (oldest-first of the last N); reverse
   * for newest-first display.
   */
  app.get("/v1/apps/:appId/events", async (c) => {
    const limit = Math.min(Number(c.req.query("limit")) || 50, 200);
    const events = await store.listEvents(c.req.param("appId"), { limit });
    return c.json({ events: events.reverse() });
  });

  /**
   * Tunable look-invariants (the design-config). The console edits these; the
   * design plane reads them per request. PUT validates via zod — the onError
   * handler maps a ZodError to a 400.
   */
  app.get("/v1/apps/:appId/design-config", async (c) =>
    c.json(await store.getDesignConfig(c.req.param("appId"))),
  );
  app.put("/v1/apps/:appId/design-config", async (c) => {
    const config = DesignConfigSchema.parse(await c.req.json());
    await store.putDesignConfig(c.req.param("appId"), config);
    return c.json(config);
  });

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
