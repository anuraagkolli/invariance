import type { AppManifest, Endpoint, HookPhase, ModBundle } from "@invariance/schema";
import { AppManifestSchema } from "@invariance/schema";
import { verifyBundle } from "@invariance/schema/signing";
import { checkCapabilityWrites, checkFieldConstraints } from "./enforce";
import { executeHook } from "./sandbox";

export interface InvarianceServerConfig {
  registryUrl: string;
  appId: string;
  /** Pin the signing key; when omitted it is fetched from the registry. */
  publicKeyPem?: string;
  /** TTL for the manifest/key caches (default 60s) and pointer cache (default 5s). */
  cacheTtlMs?: number;
  pointerTtlMs?: number;
  /** Disable fire-and-forget enforcement telemetry back to the registry. */
  telemetry?: boolean;
}

interface PointerResponse {
  status: "active" | "stale" | "degraded" | "disabled" | "none";
  contentHash?: string;
}

/**
 * Opt every registry GET out of caching. Hosts like Next.js wrap global fetch
 * with a Data Cache that replays constant-URL responses (e.g. /signing-key,
 * /manifest) from disk across process restarts — which, with the control
 * plane's per-process ephemeral signing key, serves a stale key and makes every
 * bundle fail signature verification (silent no-op). This runtime does its own
 * TTL caching (keyCache/manifestCache/pointerCache); the transport must not add
 * its own. A standard RequestInit field — harmless on Node/undici, load-bearing
 * under Next.
 */
const NO_STORE: RequestInit = { cache: "no-store" };

interface Cached<T> {
  value: T;
  expiresAt: number;
}

/**
 * Transport-agnostic Tier-1 runtime: resolves the subject's verified bundle
 * and runs its hooks over JSON payloads under capability + policy
 * enforcement. Every failure — fetch, signature, sandbox, budget, capability,
 * constraint — fails open: the caller always gets a usable payload and the
 * host app never breaks because of a mod.
 */
export class InvarianceRuntime {
  private manifestCache: Cached<AppManifest | null> | null = null;
  private keyCache: Cached<string> | null = null;
  private pointerCache = new Map<string, Cached<PointerResponse>>();
  /** contentHash -> verified bundle; immutable, so cached without TTL. */
  private bundleCache = new Map<string, ModBundle>();

  constructor(private readonly config: InvarianceServerConfig) {}

  private url(path: string): string {
    return `${this.config.registryUrl.replace(/\/$/, "")}${path}`;
  }

  private get cacheTtlMs(): number {
    return this.config.cacheTtlMs ?? 60_000;
  }

  private get pointerTtlMs(): number {
    return this.config.pointerTtlMs ?? 5_000;
  }

  /** Fire-and-forget enforcement telemetry; failures are swallowed. */
  private emit(type: string, subjectId: string, detail: Record<string, unknown>): void {
    if (this.config.telemetry === false) return;
    try {
      void fetch(this.url(`/v1/apps/${this.config.appId}/events`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type, subjectId, detail, at: Date.now() }),
      }).catch(() => undefined);
    } catch {
      // Telemetry must never affect the host app.
    }
  }

  async getManifest(): Promise<AppManifest | null> {
    const now = Date.now();
    if (this.manifestCache && this.manifestCache.expiresAt > now) {
      return this.manifestCache.value;
    }
    try {
      const res = await fetch(this.url(`/v1/apps/${this.config.appId}/manifest`), NO_STORE);
      const manifest = res.ok ? AppManifestSchema.parse(await res.json()) : null;
      this.manifestCache = { value: manifest, expiresAt: now + this.cacheTtlMs };
      return manifest;
    } catch {
      // Keep serving the last known manifest past its TTL rather than
      // dropping enforcement data on a transient registry outage.
      return this.manifestCache?.value ?? null;
    }
  }

  private async getPublicKey(): Promise<string | null> {
    if (this.config.publicKeyPem) return this.config.publicKeyPem;
    const now = Date.now();
    if (this.keyCache && this.keyCache.expiresAt > now) return this.keyCache.value;
    try {
      const res = await fetch(this.url(`/v1/apps/${this.config.appId}/signing-key`), NO_STORE);
      if (!res.ok) return this.keyCache?.value ?? null;
      const { publicKeyPem } = (await res.json()) as { publicKeyPem: string };
      this.keyCache = { value: publicKeyPem, expiresAt: now + this.cacheTtlMs };
      return publicKeyPem;
    } catch {
      return this.keyCache?.value ?? null;
    }
  }

  private async getPointer(subjectId: string): Promise<PointerResponse> {
    const now = Date.now();
    const cached = this.pointerCache.get(subjectId);
    if (cached && cached.expiresAt > now) return cached.value;
    const res = await fetch(
      this.url(`/v1/apps/${this.config.appId}/subjects/${encodeURIComponent(subjectId)}/pointer`),
      NO_STORE,
    );
    if (!res.ok) throw new Error(`pointer fetch failed: ${res.status}`);
    const pointer = (await res.json()) as PointerResponse;
    this.pointerCache.set(subjectId, { value: pointer, expiresAt: now + this.pointerTtlMs });
    return pointer;
  }

  /**
   * The subject's executable bundle, or null. Only `active` pointers execute:
   * a `stale` mod (developer shipped a new manifest) gets base API behavior
   * until the subject's next client session revalidates it — the server never
   * runs hooks that were verified against a previous contract.
   */
  async getActiveBundle(subjectId: string): Promise<ModBundle | null> {
    try {
      const pointer = await this.getPointer(subjectId);
      if (pointer.status !== "active" || !pointer.contentHash) return null;
      const cached = this.bundleCache.get(pointer.contentHash);
      if (cached) return cached;
      const res = await fetch(
        this.url(`/v1/apps/${this.config.appId}/bundles/${pointer.contentHash}`),
        NO_STORE,
      );
      if (!res.ok) return null;
      const publicKeyPem = await this.getPublicKey();
      if (!publicKeyPem) return null;
      // verifyBundle checks hash + signature + schema; throws on any mismatch.
      const bundle = verifyBundle(await res.json(), publicKeyPem);
      this.bundleCache.set(pointer.contentHash, bundle);
      return bundle;
    } catch {
      return null;
    }
  }

  /** Match an incoming request against the manifest's endpoint patterns. */
  matchEndpoint(manifest: AppManifest, method: string, pathname: string): Endpoint | null {
    const requestSegments = pathname.split("/").filter(Boolean);
    for (const endpoint of manifest.endpoints) {
      if (endpoint.method !== method.toUpperCase()) continue;
      const patternSegments = endpoint.path.split("/").filter(Boolean);
      if (patternSegments.length !== requestSegments.length) continue;
      const matches = patternSegments.every(
        (segment, i) => segment.startsWith(":") || segment === requestSegments[i],
      );
      if (matches) return endpoint;
    }
    return null;
  }

  /**
   * Run the subject's hooks for one endpoint+phase over a JSON payload.
   * Hooks run in bundle order, each receiving the previous output. After each
   * hook, undeclared writes discard that hook's output; after the chain,
   * field-constraint violations fall back to the original payload.
   */
  async transform(
    subjectId: string,
    endpoint: Endpoint,
    phase: HookPhase,
    payload: unknown,
  ): Promise<unknown> {
    try {
      const bundle = await this.getActiveBundle(subjectId);
      if (!bundle) return payload;
      const hooks = bundle.hooks.filter(
        (h) => h.trigger.endpointId === endpoint.id && h.trigger.phase === phase,
      );
      if (hooks.length === 0) return payload;
      // No manifest means no policy data — refuse to execute rather than run
      // hooks unconstrained.
      const manifest = await this.getManifest();
      if (!manifest) return payload;

      let current = payload;
      for (const hook of hooks) {
        const execution = await executeHook(hook.source, current, bundle.capabilities.budgets);
        if (!execution.ok) {
          this.emit("hook_failed", subjectId, {
            modId: bundle.id,
            hookId: hook.id,
            endpointId: endpoint.id,
            phase,
            reason: execution.reason,
          });
          continue;
        }
        const violations = checkCapabilityWrites(
          current,
          execution.result,
          bundle.capabilities,
          endpoint.id,
        );
        if (violations.length > 0) {
          this.emit("hook_capability_violation", subjectId, {
            modId: bundle.id,
            hookId: hook.id,
            endpointId: endpoint.id,
            phase,
            violations,
          });
          continue;
        }
        current = execution.result;
      }

      const violations = checkFieldConstraints(manifest, endpoint.id, payload, current);
      if (violations.length > 0) {
        this.emit("hook_policy_violation", subjectId, {
          modId: bundle.id,
          endpointId: endpoint.id,
          phase,
          violations,
        });
        return payload;
      }
      return current;
    } catch {
      return payload;
    }
  }
}
