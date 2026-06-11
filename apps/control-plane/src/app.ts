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
import { modAdminView, summarizeApp } from "./modules/analytics";
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
import { MemoryStore } from "./store";

export interface ControlPlaneOptions {
  store?: MemoryStore;
  keys?: SigningKeyPair;
  /** Authoring agent; defaults to AnthropicAgent when ANTHROPIC_API_KEY is set. */
  agent?: AuthoringAgent;
}

const MAX_EVENTS_PER_APP = 50_000;

export const ModDraftSchema = z.object({
  uiOps: z.array(UiOpSchema).optional(),
  hooks: z.array(HookModuleSchema).optional(),
  capabilities: CapabilityManifestSchema.optional(),
});

export interface ControlPlane {
  app: Hono;
  store: MemoryStore;
  keys: SigningKeyPair;
}

export function createControlPlane(options: ControlPlaneOptions = {}): ControlPlane {
  const store = options.store ?? new MemoryStore();
  const keys = options.keys ?? loadKeys();
  const agent =
    options.agent ?? (process.env.ANTHROPIC_API_KEY ? new AnthropicAgent() : null);
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
    const result = publishManifest(store, c.req.param("appId"), await c.req.json());
    return c.json(
      { version: result.manifest.version, staleMods: result.staleCount },
      201,
    );
  });

  app.get("/v1/apps/:appId/manifest", (c) => {
    const manifest = store.currentManifest(c.req.param("appId"));
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
    const bundle = assembleBundle(store, appId, c.req.param("subjectId"), draft);
    const manifest = store.currentManifest(appId)!;
    const verdict = verifyBundleAgainstManifest(bundle, manifest);
    if (!verdict.ok) {
      return c.json({ error: "verification failed", reasons: verdict.reasons }, 422);
    }
    const record = publishBundle(store, keys, bundle, []);
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

  app.get("/v1/apps/:appId/subjects/:subjectId/pointer", (c) =>
    c.json(getPointer(store, c.req.param("appId"), c.req.param("subjectId"))),
  );

  /** Lazy migration: re-verify a stale modset against the current manifest. */
  app.post("/v1/apps/:appId/subjects/:subjectId/revalidate", (c) =>
    c.json(revalidateSubject(store, keys, c.req.param("appId"), c.req.param("subjectId"))),
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
    const events = store.app(appId).events;
    events.push({ ...event.data, appId, at: Date.now() });
    if (events.length > MAX_EVENTS_PER_APP) {
      events.splice(0, events.length - MAX_EVENTS_PER_APP);
    }
    return c.json({ accepted: true }, 202);
  });

  app.get("/v1/apps/:appId/analytics/summary", (c) =>
    c.json(summarizeApp(store, c.req.param("appId"))),
  );

  /** Mods admin: every record (envelope payloads excluded) with classification. */
  app.get("/v1/apps/:appId/mods", (c) =>
    c.json({ mods: store.allMods(c.req.param("appId")).map(modAdminView) }),
  );

  /** Developer kill switch: propagates via the subject's pointer within its TTL. */
  app.post("/v1/apps/:appId/mods/:modId/kill", (c) => {
    const appId = c.req.param("appId");
    const record = setModStatus(store, appId, c.req.param("modId"), "disabled");
    store.app(appId).events.push({
      type: "mod_killed",
      appId,
      subjectId: record.subjectId,
      modId: record.modId,
      at: Date.now(),
    });
    return c.json(modAdminView(record));
  });

  app.post("/v1/apps/:appId/mods/:modId/restore", (c) => {
    const appId = c.req.param("appId");
    const record = setModStatus(store, appId, c.req.param("modId"), "active");
    store.app(appId).events.push({
      type: "mod_restored",
      appId,
      subjectId: record.subjectId,
      modId: record.modId,
      at: Date.now(),
    });
    return c.json(modAdminView(record));
  });

  app.get("/v1/apps/:appId/bundles/:hash", (c) => {
    const envelope = store.app(c.req.param("appId")).bundlesByHash.get(c.req.param("hash"));
    if (!envelope) return c.json({ error: "bundle not found" }, 404);
    c.header("cache-control", "public, max-age=31536000, immutable");
    return c.json(envelope);
  });

  return { app, store, keys };
}
