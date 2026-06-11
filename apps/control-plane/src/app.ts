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
import {
  assembleBundle,
  getPointer,
  publishBundle,
  publishManifest,
  RegistryError,
} from "./modules/registry";
import { MemoryStore } from "./store";

export interface ControlPlaneOptions {
  store?: MemoryStore;
  keys?: SigningKeyPair;
}

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
    const draft = ModDraftSchema.parse(await c.req.json());
    const bundle = assembleBundle(store, c.req.param("appId"), c.req.param("subjectId"), draft);
    const record = publishBundle(store, keys, bundle, []);
    return c.json({ modId: record.modId, contentHash: record.contentHash }, 201);
  });

  app.get("/v1/apps/:appId/subjects/:subjectId/pointer", (c) =>
    c.json(getPointer(store, c.req.param("appId"), c.req.param("subjectId"))),
  );

  app.get("/v1/apps/:appId/bundles/:hash", (c) => {
    const envelope = store.app(c.req.param("appId")).bundlesByHash.get(c.req.param("hash"));
    if (!envelope) return c.json({ error: "bundle not found" }, 404);
    c.header("cache-control", "public, max-age=31536000, immutable");
    return c.json(envelope);
  });

  return { app, store, keys };
}
