import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppManifestSchema, ModBundleSchema, type Endpoint, type SignedEnvelope } from "@invariance/schema";
import { generateSigningKeyPair, signBundle, type SigningKeyPair } from "@invariance/schema/signing";
import { InvarianceRuntime } from "../src/runtime";

/**
 * Regression guard for the Next.js Data Cache pitfall.
 *
 * The runtime resolves the control plane's per-process signing key over a
 * constant URL (`/signing-key`). Under Next.js, plain `fetch()` of a constant
 * URL is served from the on-disk Data Cache — so after the control plane
 * restarts with a fresh ephemeral key, a stale cached key makes every bundle
 * fail signature verification and silently no-op. The fix is `cache: "no-store"`
 * on the runtime's signing-key / manifest / pointer fetches.
 *
 * This test models a caching fetch layer (replays GETs by URL unless the caller
 * opts out with cache:"no-store") plus a key rotation, and asserts the hook
 * still applies — which only holds when the signing-key fetch bypasses the cache.
 */

const manifest = AppManifestSchema.parse({
  appId: "host",
  version: "1.0.0",
  endpoints: [{ id: "list-things", method: "GET", path: "/api/things" }],
  policies: [],
  createdAt: "2026-06-14T00:00:00.000Z",
});
const endpoint = manifest.endpoints.find((e) => e.id === "list-things") as Endpoint;

function reverseBundle(keys: SigningKeyPair, subjectId: string): SignedEnvelope {
  const bundle = ModBundleSchema.parse({
    id: `mod_${subjectId}`,
    appId: "host",
    subjectId,
    revision: 0,
    binding: { appManifestVersion: "1.0.0" },
    uiOps: [],
    hooks: [
      {
        id: "h",
        trigger: { endpointId: "list-things", phase: "response" },
        language: "js",
        source: "(p)=>({...p, items:[...p.items].reverse()})",
      },
    ],
    capabilities: {
      reads: [{ endpointId: "list-things" }],
      writes: [{ endpointId: "list-things", fields: ["items"] }],
      budgets: { cpuMs: 50, memMb: 32 },
    },
    createdAt: "2026-06-14T00:00:00.000Z",
  });
  return signBundle(bundle, keys.privateKeyPem, keys.keyId);
}

function mkRes(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 404,
    statusText: ok ? "OK" : "Not Found",
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => body,
    clone() {
      return mkRes(body, ok);
    },
  } as unknown as Response;
}

/** A Next-style caching fetch: GETs are replayed by URL unless cache:"no-store". */
function cachingFetch(state: { keys: SigningKeyPair; bundles: Map<string, SignedEnvelope> }) {
  const cache = new Map<string, unknown>();
  const live = (path: string): { ok: boolean; body: unknown } => {
    if (path.endsWith("/manifest")) return { ok: true, body: manifest };
    if (path.endsWith("/signing-key"))
      return { ok: true, body: { publicKeyPem: state.keys.publicKeyPem, keyId: state.keys.keyId } };
    if (path.includes("/pointer")) {
      const subject = decodeURIComponent(path.split("/subjects/")[1]!.split("/")[0]!);
      const env = state.bundles.get(subject);
      return env
        ? { ok: true, body: { status: "active", contentHash: env.contentHash } }
        : { ok: true, body: { status: "none" } };
    }
    if (path.includes("/bundles/")) {
      const hash = path.split("/bundles/")[1]!;
      for (const env of state.bundles.values()) if (env.contentHash === hash) return { ok: true, body: env };
      return { ok: false, body: { error: "nf" } };
    }
    return { ok: false, body: { error: "nf" } };
  };
  const fn = async (
    input: string | URL | Request,
    init?: RequestInit & { cache?: string },
  ): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    const path = new URL(url).pathname;
    const method = (init?.method ?? "GET").toUpperCase();
    if (method !== "GET") return mkRes({}, true); // events POST etc.
    const noStore = init?.cache === "no-store";
    if (!noStore && cache.has(url)) return mkRes(cache.get(url), true);
    const r = live(path);
    if (!noStore && r.ok) cache.set(url, r.body);
    return mkRes(r.body, r.ok);
  };
  // expose a way to pre-warm the cache (simulate a stale on-disk entry)
  (fn as { prewarm?: (url: string) => Promise<void> }).prewarm = async (url: string) => {
    cache.set(url, live(new URL(url).pathname).body);
  };
  return fn as typeof fn & { prewarm: (url: string) => Promise<void> };
}

const REGISTRY = "http://cp.test";
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("runtime resilience to a caching fetch layer (Next Data Cache)", () => {
  it("applies a hook after a control-plane key rotation despite a stale cached signing-key", async () => {
    const keysA = generateSigningKeyPair();
    const keysB = generateSigningKeyPair();
    const state = { keys: keysA, bundles: new Map<string, SignedEnvelope>() };
    const fetchShim = cachingFetch(state);
    globalThis.fetch = fetchShim as unknown as typeof fetch;

    // A previous control-plane process (keysA) populated the on-disk cache for
    // the constant signing-key URL.
    await fetchShim.prewarm(`${REGISTRY}/v1/apps/host/signing-key`);

    // Control plane restarts with a fresh ephemeral key and signs the subject's
    // bundle with it (a new subject -> unique content-addressed bundle URL, so
    // the bundle itself is fetched fresh).
    state.keys = keysB;
    state.bundles.set("u1", reverseBundle(keysB, "u1"));

    // A fresh runtime (empty in-process caches) — exactly a freshly-started host.
    const runtime = new InvarianceRuntime({ registryUrl: REGISTRY, appId: "host", telemetry: false });
    const out = (await runtime.transform("u1", endpoint, "response", {
      items: [{ name: "alpha" }, { name: "beta" }],
    })) as { items: Array<{ name: string }> };

    // The hook must apply: this only holds if /signing-key bypassed the stale
    // cache and fetched keysB. With a cached keysA, verifyBundle fails and the
    // hook silently no-ops (returns ["alpha","beta"]).
    expect(out.items.map((i) => i.name)).toEqual(["beta", "alpha"]);
  });
});
