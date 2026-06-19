// apps/control-plane/src/theming/delivery/resolve-blocking-script.ts
//
// The SECOND data-plane delivery sink (spec §1.3 "the blocking-script fallback tier") for hosts that
// cannot inline a <style> into <head> server-side. Same pointer → artifact-by-hash → hash-check →
// fail-open resolution as resolveThemeTag (Task 5), but emits a synchronous (render-blocking)
// <script nonce> that builds a <style> and appends it at the END of <head> before first paint
// (cascade-win, §7.2). Fail open EVERYWHERE with the identical FailOpenReason union.

import { renderStyleText, hashArtifact, isSafeCssTokenValue } from "@invariance/theming";
import type { FailOpenReason, ResolveThemeTagArgs } from "./resolve-theme-tag.js";

/**
 * Neutralize the one HTML-parser breakout an inline script body can carry: a literal `</script`
 * sequence. CSS values already pass isSafeCssTokenValue (no `</style>`, no breakout), and the JSON
 * string is the only place text is embedded, so escaping `</` → `<\/` makes the closing tag inert.
 */
function escapeForInlineScript(json: string): string {
  return json.replace(/<\//g, "<\\/");
}

export async function resolveBlockingScript(
  args: ResolveThemeTagArgs,
): Promise<{ script: string } | { script: null; reason: FailOpenReason }> {
  const { tenant, mode, nonce, stores } = args;

  // Same fail-open order as resolveThemeTag (Task 5): nonce → pointer → artifact → hash → unsafe.
  if (!nonce) return { script: null, reason: "no_nonce" };

  const pointer = await stores.pointer.getPointer(tenant);
  if (pointer === null) return { script: null, reason: "pointer_miss" };
  if (pointer.status === "disabled") return { script: null, reason: "pointer_disabled" };

  const artifact = await stores.blob.getArtifact(pointer.hash);
  if (artifact === null) return { script: null, reason: "artifact_missing" };

  if (hashArtifact(artifact) !== pointer.hash) return { script: null, reason: "hash_mismatch" };

  const modeBlock = artifact.modes[mode];
  const vars = modeBlock ? modeBlock.vars : artifact.modes.light!.vars;
  for (const value of Object.values(vars)) {
    if (!isSafeCssTokenValue(value)) return { script: null, reason: "unsafe_value" };
  }

  // The pure renderer is the SAME core the SSR sink uses (one applier, two sinks — §7.2).
  const css = renderStyleText(artifact, mode);
  const cssLiteral = escapeForInlineScript(JSON.stringify(css));

  // Synchronous, render-blocking: create a <style>, set its text to the resolved CSS, append at the
  // END of <head> so source-order breaks the cascade tie in our favor (§7.2).
  const body =
    `(function(){var s=document.createElement('style');` +
    `s.setAttribute('nonce',${escapeForInlineScript(JSON.stringify(nonce))});` +
    `s.textContent=${cssLiteral};` +
    `document.head.appendChild(s);})();`;
  return { script: `<script nonce="${nonce}">${body}</script>` };
}
