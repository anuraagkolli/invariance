// packages/theming/src/artifact/hash-artifact.ts
import { createHash } from "node:crypto";
import { canonicalJson } from "@invariance/schema";
import type { ThemeArtifact } from "./theme-artifact.js";

// Content address over canonical JSON (sorted keys at every depth).
// The artifact carries no `hash` field — the hash IS the address — so there is
// nothing to exclude; canonicalizing the whole value is correct (§7.1).
export function hashArtifact(artifact: ThemeArtifact): string {
  return createHash("sha256").update(canonicalJson(artifact)).digest("hex");
}
