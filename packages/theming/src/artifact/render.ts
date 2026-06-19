// packages/theming/src/artifact/render.ts
import type { ThemeArtifact } from "./theme-artifact.js";
import type { Mode, VarName } from "./deps.js";

// Pure CSS-text core. Emits `${selector} { --x: val; … }` for ONE resolved mode under the
// app's OWN mode selector (cascade-win, §7.2). Values are already emit-serialized by the
// compiler — we never re-serialize. Vars are sorted for deterministic, golden-stable output.
export function renderStyleText(artifact: ThemeArtifact, mode: Mode): string {
  const block = artifact.modes[mode];
  if (!block) return ""; // no block for this mode → render nothing; caller falls open
  const names = (Object.keys(block.vars) as VarName[]).sort();
  const lines = names.map((name) => `  ${name}: ${block.vars[name]};`);
  return `${block.selector} {\n${lines.join("\n")}\n}\n`;
}
