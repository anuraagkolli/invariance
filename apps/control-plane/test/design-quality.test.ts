import { describe, expect, it } from "vitest";
import { AppManifestSchema, ModBundleSchema } from "@invariance/schema";
import { compileTheme, ROLE_TOKENS, THEME_PACKS, type StyleSpec } from "@invariance/design/server";
import { verifyBundleAgainstManifest } from "../src/modules/verification";

// Phase 3: the verifier gates theme mods (bundles carrying design provenance)
// on the contrast/chroma properties the compiler guarantees — the safety net
// against a tampered or low-contrast theme reaching a user.
const spec: StyleSpec = THEME_PACKS[0]!.spec; // retro-arcade
const compiled = compileTheme(spec).roles;
const themeDesign = { styleSpec: spec, compiledBy: "design@test", warnings: [] };

const manifest = AppManifestSchema.parse({
  appId: "app1",
  version: "1.0.0",
  designTokens: ROLE_TOKENS.map((name) => ({ name, kind: "color", value: "#000000" })),
  components: [],
  endpoints: [],
  policies: [{ type: "design-constraint", id: "aa", contrast: 4.5 }],
  createdAt: "2026-06-10T00:00:00.000Z",
});

function tokenOps(roles: Record<string, string>) {
  return Object.entries(roles).map(([token, value]) => ({ type: "token-override" as const, token, value }));
}

function bundle(uiOps: ReturnType<typeof tokenOps>, design?: unknown) {
  return ModBundleSchema.parse({
    id: "mod_x",
    appId: "app1",
    subjectId: "u1",
    revision: 0,
    binding: { appManifestVersion: "1.0.0" },
    uiOps,
    hooks: [],
    capabilities: { reads: [], writes: [], budgets: { cpuMs: 50, memMb: 32 } },
    ...(design ? { design } : {}),
    createdAt: "2026-06-10T00:00:00.000Z",
  });
}

describe("verifier design-quality gate", () => {
  it("passes a compiler-produced theme (no false positives)", () => {
    const v = verifyBundleAgainstManifest(bundle(tokenOps(compiled), themeDesign), manifest);
    expect(v.ok, JSON.stringify(v.reasons)).toBe(true);
  });

  it("rejects a tampered theme whose primary text loses contrast", () => {
    const tampered = { ...compiled, "--inv-text-primary": compiled["--inv-surface-0"]! };
    const v = verifyBundleAgainstManifest(bundle(tokenOps(tampered), themeDesign), manifest);
    expect(v.ok).toBe(false);
    expect(v.reasons.join("\n")).toContain("--inv-text-primary on --inv-surface-0");
  });

  it("rejects invalid styleSpec provenance", () => {
    const v = verifyBundleAgainstManifest(
      bundle(tokenOps(compiled), { styleSpec: { mode: "neon" }, compiledBy: "x", warnings: [] }),
      manifest,
    );
    expect(v.ok).toBe(false);
    expect(v.reasons.join("\n")).toContain("styleSpec is invalid");
  });

  it("does NOT gate a token-override bundle without design provenance", () => {
    // Same low-contrast values, but no design provenance => not a theme mod =>
    // the design-quality gate is scoped out (raw edits are the dev's domain).
    const tampered = { ...compiled, "--inv-text-primary": compiled["--inv-surface-0"]! };
    const v = verifyBundleAgainstManifest(bundle(tokenOps(tampered)), manifest);
    expect(v.ok).toBe(true);
  });

  it("enforces an accent chroma cap from the policy", () => {
    const capped = AppManifestSchema.parse({
      ...manifest,
      policies: [{ type: "design-constraint", id: "chroma", accentChromaMax: 0.01 }],
    });
    const v = verifyBundleAgainstManifest(bundle(tokenOps(compiled), themeDesign), capped);
    expect(v.ok).toBe(false);
    expect(v.reasons.join("\n")).toContain("chroma");
  });
});
