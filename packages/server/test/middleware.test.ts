import {
  AppManifestSchema,
  ModBundleSchema,
  type AppManifest,
  type ModBundle,
  type SignedEnvelope,
} from "@invariance/schema";
import { generateSigningKeyPair, signBundle } from "@invariance/schema/signing";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createInvarianceMiddleware } from "../src/express";
import { withInvariance } from "../src/fetch";

/**
 * Self-contained integration harness: a fake registry (signed bundles, real
 * signatures) plus a tiny host API behind the middleware. No control-plane
 * dependency — this package must stand alone.
 */

const keys = generateSigningKeyPair();

const manifest: AppManifest = AppManifestSchema.parse({
  appId: "host",
  version: "1.0.0",
  endpoints: [
    { id: "list-things", method: "GET", path: "/api/things" },
    { id: "add-thing", method: "POST", path: "/api/things" },
    { id: "get-thing", method: "GET", path: "/api/things/:id" },
  ],
  policies: [
    {
      type: "field-constraint",
      id: "name-immutable",
      endpointId: "list-things",
      fieldPath: "items.*.name",
      constraint: { immutable: true },
    },
    {
      type: "field-constraint",
      id: "qty-range",
      endpointId: "add-thing",
      fieldPath: "qty",
      constraint: { min: 1, max: 10 },
    },
  ],
  createdAt: new Date().toISOString(),
});

function makeBundle(partial: Partial<ModBundle>): SignedEnvelope {
  const bundle = ModBundleSchema.parse({
    id: `mod_${Math.random().toString(36).slice(2)}`,
    appId: "host",
    subjectId: "user-1",
    revision: 0,
    binding: { appManifestVersion: "1.0.0" },
    uiOps: [],
    hooks: [],
    capabilities: { reads: [], writes: [], budgets: { cpuMs: 50, memMb: 32 } },
    createdAt: new Date().toISOString(),
    ...partial,
  });
  return signBundle(bundle, keys.privateKeyPem, keys.keyId);
}

interface FakeRegistry {
  url: string;
  events: unknown[];
  /** subjectId -> { envelope, status } */
  set(subjectId: string, envelope: SignedEnvelope, status?: string): void;
  close(): Promise<void>;
}

async function startFakeRegistry(): Promise<FakeRegistry> {
  const subjects = new Map<string, { envelope: SignedEnvelope; status: string }>();
  const events: unknown[] = [];
  const app = express();
  app.use(express.json());
  app.get("/v1/apps/host/manifest", (_req, res) => res.json(manifest));
  app.get("/v1/apps/host/signing-key", (_req, res) =>
    res.json({ publicKeyPem: keys.publicKeyPem, keyId: keys.keyId }),
  );
  app.get("/v1/apps/host/subjects/:subjectId/pointer", (req, res) => {
    const entry = subjects.get(req.params.subjectId);
    if (!entry) return res.json({ status: "none" });
    res.json({ status: entry.status, contentHash: entry.envelope.contentHash });
  });
  app.get("/v1/apps/host/bundles/:hash", (req, res) => {
    for (const { envelope } of subjects.values()) {
      if (envelope.contentHash === req.params.hash) return res.json(envelope);
    }
    res.status(404).json({ error: "not found" });
  });
  app.post("/v1/apps/host/events", (req, res) => {
    events.push(req.body);
    res.status(202).end();
  });

  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    events,
    set: (subjectId, envelope, status = "active") => subjects.set(subjectId, { envelope, status }),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

async function startHost(registryUrl: string): Promise<{ url: string; close: () => Promise<void> }> {
  const app = express();
  app.use(express.json());
  app.use(
    createInvarianceMiddleware({
      registryUrl,
      appId: "host",
      // Per-request caches off so each test sees its own pointer state.
      pointerTtlMs: 0,
      cacheTtlMs: 60_000,
    }),
  );
  app.get("/api/things", (_req, res) => {
    res.json({ items: [{ name: "alpha", qty: 1 }, { name: "beta", qty: 2 }] });
  });
  app.post("/api/things", (req, res) => {
    res.status(201).json({ received: req.body });
  });
  app.get("/api/things/:id", (req, res) => {
    res.json({ item: { name: req.params.id } });
  });
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

let registry: FakeRegistry;
let host: { url: string; close: () => Promise<void> };

const getThings = async (subject: string) => {
  const res = await fetch(`${host.url}/api/things`, {
    headers: { "x-invariance-subject": subject },
  });
  return (await res.json()) as { items: Array<{ name: string; qty: number }> };
};

beforeAll(async () => {
  registry = await startFakeRegistry();
  host = await startHost(registry.url);
});

afterAll(async () => {
  await host.close();
  await registry.close();
});

describe("express middleware", () => {
  it("a response hook reorders the payload under enforcement", async () => {
    registry.set(
      "reverser",
      makeBundle({
        subjectId: "reverser",
        hooks: [
          {
            id: "hook_reverse",
            trigger: { endpointId: "list-things", phase: "response" },
            language: "js",
            source: "(payload) => ({ ...payload, items: [...payload.items].reverse() })",
          },
        ],
        capabilities: {
          reads: [{ endpointId: "list-things" }],
          writes: [{ endpointId: "list-things", fields: ["items"] }],
          budgets: { cpuMs: 50, memMb: 32 },
        },
      }),
    );
    const body = await getThings("reverser");
    expect(body.items.map((i) => i.name)).toEqual(["beta", "alpha"]);
  });

  it("requests without a subject pass through untouched", async () => {
    const res = await fetch(`${host.url}/api/things`);
    const body = (await res.json()) as { items: Array<{ name: string }> };
    expect(body.items.map((i) => i.name)).toEqual(["alpha", "beta"]);
  });

  it("an undeclared field write is discarded (base behavior)", async () => {
    registry.set(
      "smuggler",
      makeBundle({
        subjectId: "smuggler",
        hooks: [
          {
            id: "hook_smuggle",
            trigger: { endpointId: "list-things", phase: "response" },
            language: "js",
            source: "(payload) => ({ ...payload, injected: true })",
          },
        ],
        capabilities: {
          reads: [{ endpointId: "list-things" }],
          writes: [{ endpointId: "list-things", fields: ["items"] }],
          budgets: { cpuMs: 50, memMb: 32 },
        },
      }),
    );
    const body = await getThings("smuggler");
    expect(body).toEqual({ items: [{ name: "alpha", qty: 1 }, { name: "beta", qty: 2 }] });
    await new Promise((r) => setTimeout(r, 50));
    expect(JSON.stringify(registry.events)).toContain("hook_capability_violation");
  });

  it("an immutable-field rewrite is rolled back even when declared writes cover it", async () => {
    registry.set(
      "renamer",
      makeBundle({
        subjectId: "renamer",
        hooks: [
          {
            id: "hook_rename",
            trigger: { endpointId: "list-things", phase: "response" },
            language: "js",
            source:
              "(payload) => ({ ...payload, items: payload.items.map((i) => ({ ...i, name: 'HACKED' })) })",
          },
        ],
        capabilities: {
          reads: [{ endpointId: "list-things" }],
          // Whole-subtree write declaration: passes the capability check, so
          // the policy layer must be the one to catch it.
          writes: [{ endpointId: "list-things", fields: ["items"] }],
          budgets: { cpuMs: 50, memMb: 32 },
        },
      }),
    );
    const body = await getThings("renamer");
    expect(body.items.map((i) => i.name)).toEqual(["alpha", "beta"]);
  });

  it("a request hook transforms the body, and constraint violations fall back", async () => {
    registry.set(
      "bumper",
      makeBundle({
        subjectId: "bumper",
        hooks: [
          {
            id: "hook_bump",
            trigger: { endpointId: "add-thing", phase: "request" },
            language: "js",
            source: "(payload) => ({ ...payload, qty: payload.qty + 1 })",
          },
        ],
        capabilities: {
          reads: [{ endpointId: "add-thing" }],
          writes: [{ endpointId: "add-thing", fields: ["qty"] }],
          budgets: { cpuMs: 50, memMb: 32 },
        },
      }),
    );
    const post = async (qty: number) => {
      const res = await fetch(`${host.url}/api/things`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-invariance-subject": "bumper" },
        body: JSON.stringify({ name: "gamma", qty }),
      });
      return (await res.json()) as { received: { qty: number } };
    };
    expect((await post(3)).received.qty).toBe(4); // transformed
    expect((await post(10)).received.qty).toBe(10); // 11 violates max:10 -> original body
  });

  it("an infinite-loop hook is interrupted and the response is served", async () => {
    registry.set(
      "looper",
      makeBundle({
        subjectId: "looper",
        hooks: [
          {
            id: "hook_loop",
            trigger: { endpointId: "list-things", phase: "response" },
            language: "js",
            source: "(payload) => { while (true) {} }",
          },
        ],
        capabilities: {
          reads: [{ endpointId: "list-things" }],
          writes: [{ endpointId: "list-things", fields: ["items"] }],
          budgets: { cpuMs: 30, memMb: 32 },
        },
      }),
    );
    const body = await getThings("looper");
    expect(body.items.map((i) => i.name)).toEqual(["alpha", "beta"]);
  });

  it("a tampered envelope fails signature verification and is never executed", async () => {
    const envelope = makeBundle({
      subjectId: "tamper",
      hooks: [
        {
          id: "hook_evil",
          trigger: { endpointId: "list-things", phase: "response" },
          language: "js",
          source: "(payload) => ({ ...payload, items: [] })",
        },
      ],
      capabilities: {
        reads: [{ endpointId: "list-things" }],
        writes: [{ endpointId: "list-things" }],
        budgets: { cpuMs: 50, memMb: 32 },
      },
    });
    const forged = { ...envelope, signature: Buffer.from("forged-signature-bytes").toString("base64") };
    registry.set("tamper", forged as SignedEnvelope);
    const body = await getThings("tamper");
    expect(body.items).toHaveLength(2);
  });

  it("stale pointers do not execute (base behavior until revalidation)", async () => {
    registry.set(
      "stale-user",
      makeBundle({
        subjectId: "stale-user",
        hooks: [
          {
            id: "hook_reverse",
            trigger: { endpointId: "list-things", phase: "response" },
            language: "js",
            source: "(payload) => ({ ...payload, items: [...payload.items].reverse() })",
          },
        ],
        capabilities: {
          reads: [{ endpointId: "list-things" }],
          writes: [{ endpointId: "list-things", fields: ["items"] }],
          budgets: { cpuMs: 50, memMb: 32 },
        },
      }),
      "stale",
    );
    const body = await getThings("stale-user");
    expect(body.items.map((i) => i.name)).toEqual(["alpha", "beta"]);
  });

  it("path params match manifest patterns", async () => {
    registry.set(
      "param-user",
      makeBundle({
        subjectId: "param-user",
        hooks: [
          {
            id: "hook_upper",
            trigger: { endpointId: "get-thing", phase: "response" },
            language: "js",
            source: "(payload) => ({ item: { name: payload.item.name.toUpperCase() } })",
          },
        ],
        capabilities: {
          reads: [{ endpointId: "get-thing" }],
          writes: [{ endpointId: "get-thing", fields: ["item.name"] }],
          budgets: { cpuMs: 50, memMb: 32 },
        },
      }),
    );
    const res = await fetch(`${host.url}/api/things/widget`, {
      headers: { "x-invariance-subject": "param-user" },
    });
    const body = (await res.json()) as { item: { name: string } };
    expect(body.item.name).toBe("WIDGET");
  });

  it("registry down -> host app keeps working", async () => {
    const isolated = await startHost("http://127.0.0.1:9");
    try {
      const res = await fetch(`${isolated.url}/api/things`, {
        headers: { "x-invariance-subject": "anyone" },
      });
      const body = (await res.json()) as { items: unknown[] };
      expect(body.items).toHaveLength(2);
    } finally {
      await isolated.close();
    }
  });
});

describe("fetch-style wrapper (Next.js routes)", () => {
  it("transforms JSON responses for active subjects", async () => {
    registry.set(
      "fetch-user",
      makeBundle({
        subjectId: "fetch-user",
        hooks: [
          {
            id: "hook_reverse",
            trigger: { endpointId: "list-things", phase: "response" },
            language: "js",
            source: "(payload) => ({ ...payload, items: [...payload.items].reverse() })",
          },
        ],
        capabilities: {
          reads: [{ endpointId: "list-things" }],
          writes: [{ endpointId: "list-things", fields: ["items"] }],
          budgets: { cpuMs: 50, memMb: 32 },
        },
      }),
    );
    const handler = withInvariance(
      { registryUrl: registry.url, appId: "host", pointerTtlMs: 0 },
      () =>
        new Response(JSON.stringify({ items: [{ name: "alpha" }, { name: "beta" }] }), {
          headers: { "content-type": "application/json" },
        }),
    );
    const res = await handler(
      new Request("http://host.test/api/things", {
        headers: { "x-invariance-subject": "fetch-user" },
      }),
    );
    const body = (await res.json()) as { items: Array<{ name: string }> };
    expect(body.items.map((i) => i.name)).toEqual(["beta", "alpha"]);
  });

  it("passes through untouched without a subject", async () => {
    const handler = withInvariance({ registryUrl: registry.url, appId: "host" }, () =>
      new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" },
      }),
    );
    const res = await handler(new Request("http://host.test/api/things"));
    expect(await res.json()).toEqual({ ok: true });
  });
});
