// apps/control-plane/src/theming/delivery/resolve-theme-tag.ts
//
// Data-plane SSR delivery adapter (spec §1.3, §7.2). Fail open EVERYWHERE: pointer miss, kill-switch,
// artifact missing, hash mismatch, unsafe value, or no nonce → return { tag: null, reason } and the
// base design renders. A pointer miss and a disabled pointer are DISTINCT telemetry events (§7.3).

import {
  styleTag,
  hashArtifact,
  isSafeCssTokenValue,
  type Mode,
} from "@invariance/theming";
import type { PointerStore, BlobStore } from "../publish/stores.js";

export type FailOpenReason =
  | "pointer_miss" // no key (distinct telemetry event)
  | "pointer_disabled" // status:"disabled" kill-switch (distinct telemetry event)
  | "artifact_missing" // hash not in blob store
  | "hash_mismatch" // fetched artifact does not match the pointer hash
  | "unsafe_value" // isSafeCssTokenValue failed at apply time
  | "no_nonce"; // CSP enforced + no nonce → fail open

export type ResolveThemeTagArgs = {
  tenant: string;
  mode: Mode; // resolved mode from the cookie (or manifest.modes.default on cold-start)
  nonce: string; // server-minted CSP nonce
  stores: { pointer: PointerStore; blob: BlobStore };
};

export async function resolveThemeTag(
  args: ResolveThemeTagArgs,
): Promise<{ tag: string } | { tag: null; reason: FailOpenReason }> {
  const { tenant, mode, nonce, stores } = args;

  // CSP fail-open guard FIRST: no nonce means we cannot inject under an enforced CSP.
  if (!nonce) return { tag: null, reason: "no_nonce" };

  const pointer = await stores.pointer.getPointer(tenant);
  if (pointer === null) return { tag: null, reason: "pointer_miss" };
  if (pointer.status === "disabled") return { tag: null, reason: "pointer_disabled" };

  const artifact = await stores.blob.getArtifact(pointer.hash);
  if (artifact === null) return { tag: null, reason: "artifact_missing" };

  // Re-verify content-addressing: a fetched artifact MUST hash back to the pointer's hash.
  if (hashArtifact(artifact) !== pointer.hash) return { tag: null, reason: "hash_mismatch" };

  // Final apply-time fail-open: scan the resolved mode's emitted values for any unsafe token.
  // The dark block may be absent; we only need the mode we are about to render.
  const modeBlock = artifact.modes[mode];
  const vars = modeBlock ? modeBlock.vars : artifact.modes.light!.vars;
  for (const value of Object.values(vars)) {
    if (!isSafeCssTokenValue(value)) return { tag: null, reason: "unsafe_value" };
  }

  return { tag: styleTag(artifact, mode, { nonce }) };
}
