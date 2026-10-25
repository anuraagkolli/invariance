import { ModLoader } from "./core/loader";
import { applyOverlay, DEFAULT_SCOPE_ATTRIBUTE } from "./core/overlay";
import type { InvarianceClientConfig } from "./core/types";

/**
 * Script-tag entry for non-React apps (Tier 0, tokens + style rules only —
 * slot overrides need the React component layer).
 *
 *   <script src=".../invariance.js"
 *           data-registry="https://cp.example.com"
 *           data-app="myapp" data-subject="user_42"></script>
 */
export async function init(config: InvarianceClientConfig): Promise<void> {
  document.body.setAttribute(config.scopeAttribute ?? DEFAULT_SCOPE_ATTRIBUTE, "");
  const loaded = await new ModLoader(config).load();
  if (loaded.bundle) {
    applyOverlay(loaded.bundle, config.scopeAttribute);
  }
}

const script = typeof document !== "undefined" ? document.currentScript : null;
if (script instanceof HTMLScriptElement && script.dataset.app) {
  void init({
    registryUrl: script.dataset.registry ?? "",
    appId: script.dataset.app,
    subjectId: script.dataset.subject ?? "anonymous",
  });
}
