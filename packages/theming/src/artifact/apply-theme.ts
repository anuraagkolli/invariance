// packages/theming/src/artifact/apply-theme.ts
import type { ThemeArtifact } from "./theme-artifact.js";
import type { Mode } from "./deps.js";
import { isSafeCssTokenValue } from "./deps.js";
import { renderStyleText } from "./render.js";

// CLIENT sink. Injects a <style> at the END of <head> (source-order cascade win).
// Nonce is DISCOVERED via the .nonce IDL property. Fail open: unsafe value, or
// CSP-enforced-but-no-usable-nonce, or no block → inject nothing. (§7.2)
export function applyTheme(
  artifact: ThemeArtifact,
  mode: Mode,
  opts: { doc: Document },
): void {
  const block = artifact.modes[mode];
  if (!block) return; // no block for this mode → inject nothing

  // Final apply-time safety gate: any unsafe value → inject nothing (fail open, §1.3).
  for (const value of Object.values(block.vars)) {
    if (!isSafeCssTokenValue(value)) return;
  }

  const css = renderStyleText(artifact, mode);
  if (css === "") return;

  const { doc } = opts;
  // Discover a trusted nonce via the .nonce IDL property (the attribute is hidden in the DOM).
  const trusted = doc.querySelector("style[nonce],script[nonce]") as
    | (HTMLElement & { nonce?: string })
    | null;

  const style = doc.createElement("style");
  if (trusted) {
    // A nonced element exists ⇒ CSP nonces are in force. We MUST carry a usable nonce.
    const nonce = trusted.nonce;
    if (!nonce) return; // CSP enforced but no usable nonce → fail open
    style.nonce = nonce;
  }
  // else: no nonced element anywhere ⇒ CSP-with-nonces not enforced ⇒ inject without a nonce.

  style.textContent = css;
  doc.head.appendChild(style); // END of <head> → source-order breaks the cascade tie in our favor
}
