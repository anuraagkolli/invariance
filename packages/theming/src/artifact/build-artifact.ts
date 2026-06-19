// packages/theming/src/artifact/build-artifact.ts
import type { CandidateTheme, AppManifest, Verdict } from "./deps.js";
import type { ThemeArtifact } from "./theme-artifact.js";

export const ARTIFACT_SCHEMA_VERSION = 1 as const;

// Pure: compile output + manifest selectors + verifier report → an immutable artifact.
// Dark rides through ONLY when both a dark ladder and a dark selector exist (a dark block
// with no selector cannot cascade-win; §6 refPerModeSelectorPresent / §7.2).
export function buildArtifact(
  theme: CandidateTheme,
  manifest: AppManifest,
  verdict: Verdict,
): ThemeArtifact {
  const darkSelector = manifest.modes.selectors.dark;
  const dark =
    theme.dark && darkSelector
      ? { selector: darkSelector, vars: theme.dark }
      : undefined;

  return {
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    vocabVersion: manifest.vocabVersion,
    profileVersion: manifest.profileVersion,
    appId: manifest.appId,
    modes: {
      light: { selector: manifest.modes.selectors.light, vars: theme.light },
      ...(dark ? { dark } : {}),
    },
    meta: {
      verifierReport: verdict,
      contrastFloor: manifest.invariants.contrastTier,
      chromaCap: manifest.invariants.chromaCap,
    },
  };
}
