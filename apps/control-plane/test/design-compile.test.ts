import { describe, expect, it } from "vitest";
import { compileTheme, ROLE_TOKENS, THEME_PACKS } from "@invariance/design/server";

// Phase 1 ship bar: the control-plane can run the deterministic Theme Compiler
// in-process (server-side, no LLM, no DOM). This is the engine the authoring
// pipeline (Phase 2) uses to turn a StyleSpec into token-override ops.
describe("design engine available to control-plane", () => {
  it("compiles a StyleSpec into the full role-token set, all non-empty", () => {
    const spec = THEME_PACKS[0]!.spec; // a known-valid preset (retro-arcade)
    const { roles, warnings } = compileTheme(spec);

    // Every role token the compiler is responsible for is present and resolved.
    for (const token of ROLE_TOKENS) {
      expect(roles[token], `missing role token ${token}`).toBeTruthy();
    }
    expect(Object.keys(roles).length).toBeGreaterThanOrEqual(ROLE_TOKENS.length);
    expect(warnings).toEqual([]);
  });

  it("is deterministic — same StyleSpec in, byte-identical roles out", () => {
    const spec = THEME_PACKS[0]!.spec;
    expect(JSON.stringify(compileTheme(spec).roles)).toBe(
      JSON.stringify(compileTheme(spec).roles),
    );
  });
});
