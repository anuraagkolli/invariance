import type { InvarianceClientConfig, LoadedMods, PointerResponse } from "./types";
import { importVerifyKey, verifyEnvelope } from "./verify";

const BUNDLE_CACHE_PREFIX = "invariance:bundle:";

function cacheGet(hash: string): string | null {
  try {
    return localStorage.getItem(BUNDLE_CACHE_PREFIX + hash);
  } catch {
    return null;
  }
}

function cacheSet(hash: string, envelopeJson: string): void {
  try {
    localStorage.setItem(BUNDLE_CACHE_PREFIX + hash, envelopeJson);
  } catch {
    // Cache is best-effort; immutable bundles are refetchable.
  }
}

export class ModLoader {
  private verifyKey: CryptoKey | null = null;

  constructor(private readonly config: InvarianceClientConfig) {}

  private url(path: string): string {
    return `${this.config.registryUrl.replace(/\/$/, "")}${path}`;
  }

  private async getVerifyKey(): Promise<CryptoKey> {
    if (this.verifyKey) return this.verifyKey;
    const res = await fetch(this.url(`/v1/apps/${this.config.appId}/signing-key`));
    if (!res.ok) throw new Error(`signing key fetch failed: ${res.status}`);
    const { publicKeyPem } = (await res.json()) as { publicKeyPem: string };
    this.verifyKey = await importVerifyKey(publicKeyPem);
    return this.verifyKey;
  }

  async fetchPointer(): Promise<PointerResponse> {
    const res = await fetch(
      this.url(
        `/v1/apps/${this.config.appId}/subjects/${encodeURIComponent(this.config.subjectId)}/pointer`,
      ),
    );
    if (res.status === 404) return { status: "none" };
    if (!res.ok) throw new Error(`pointer fetch failed: ${res.status}`);
    return (await res.json()) as PointerResponse;
  }

  /** Ask the control plane to re-verify a stale bundle against the current manifest. */
  async revalidate(): Promise<PointerResponse> {
    const res = await fetch(
      this.url(
        `/v1/apps/${this.config.appId}/subjects/${encodeURIComponent(this.config.subjectId)}/revalidate`,
      ),
      { method: "POST" },
    );
    if (!res.ok) throw new Error(`revalidate failed: ${res.status}`);
    return (await res.json()) as PointerResponse;
  }

  private async fetchEnvelopeJson(contentHash: string): Promise<string> {
    const cached = cacheGet(contentHash);
    if (cached) return cached;
    const res = await fetch(this.url(`/v1/apps/${this.config.appId}/bundles/${contentHash}`));
    if (!res.ok) throw new Error(`bundle fetch failed: ${res.status}`);
    const json = await res.text();
    cacheSet(contentHash, json);
    return json;
  }

  /**
   * Resolve the subject's active mods: pointer -> (revalidate if stale) ->
   * immutable bundle -> signature verification. Throws nothing to callers'
   * render path: every failure resolves to base behavior (bundle: null).
   */
  async load(): Promise<LoadedMods> {
    try {
      let pointer = await this.fetchPointer();
      if (pointer.status === "stale") {
        try {
          pointer = await this.revalidate();
        } catch {
          // Control plane unreachable: stale bundles keep working as-is
          // (they were valid when signed); fail open to the cached bundle.
        }
      }
      if (pointer.status === "degraded") {
        return { status: "degraded", bundle: null, reasons: pointer.reasons };
      }
      if (pointer.status === "disabled" || pointer.status === "none" || !pointer.contentHash) {
        return { status: pointer.status, bundle: null };
      }
      const envelopeJson = await this.fetchEnvelopeJson(pointer.contentHash);
      const key = await this.getVerifyKey();
      const bundle = await verifyEnvelope(JSON.parse(envelopeJson), key);
      return { status: pointer.status, bundle };
    } catch {
      return { status: "none", bundle: null };
    }
  }
}
