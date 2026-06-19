// packages/theming/src/artifact/style-tag.ts
import type { ThemeArtifact } from "./theme-artifact.js";
import type { Mode } from "./deps.js";
import { renderStyleText } from "./render.js";

// SERVER sink. Nonce is server-minted and handed in. Empty render → empty tag (fail open).
export function styleTag(
  artifact: ThemeArtifact,
  mode: Mode,
  opts: { nonce: string },
): string {
  const css = renderStyleText(artifact, mode);
  if (css === "") return "";
  return `<style nonce="${opts.nonce}">${css}</style>`;
}
