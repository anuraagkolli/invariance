import type { ModBundle } from "@invariance/schema";

export interface InvarianceClientConfig {
  /** Base URL of the registry/control plane, e.g. https://cp.invariance.dev */
  registryUrl: string;
  appId: string;
  /** The end user (or org) identity, as known to the host app. */
  subjectId: string;
  /**
   * Attribute used to scope style-rule selectors. The provider sets it on
   * document.body; every mod selector is prefixed with `[attr]`.
   */
  scopeAttribute?: string;
  /** Disable telemetry entirely. */
  telemetry?: boolean;
}

export type ModStatus = "active" | "stale" | "degraded" | "disabled" | "none";

export interface PointerResponse {
  status: ModStatus;
  contentHash?: string;
  /** Reasons a bundle was degraded (shown to the user with the re-fix offer). */
  reasons?: string[];
}

export interface LoadedMods {
  status: ModStatus;
  bundle: ModBundle | null;
  reasons?: string[];
}
