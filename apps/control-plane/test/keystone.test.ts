import { describe, expect, it } from "vitest";
import { generateSigningKeyPair } from "@invariance/schema/signing";
import { compileTheme, ROLE_TOKENS, THEME_PACKS, type StyleSpec } from "@invariance/design/server";
import { createDesignAwareAgent } from "../src/modules/authoring/design-author";
import { MockAgent } from "../src/modules/authoring/mock";
import { authorMod } from "../src/modules/authoring/pipeline";
import { publishManifest } from "../src/modules/registry";
import { MemoryStore } from "../src/store";

// The keystone of the combined product: a theme prompt is turned into a signed
// mod bundle whose colour values come from the deterministic OKLCH compiler,
// not from the LLM. The LLM only emits structured intent (a StyleSpec).
const keys = generateSigningKeyPair();
const spec: StyleSpec = THEME_PACKS[0]!.spec; // retro-arcade

// A manifest that declares the role-token vocabulary the compiler emits, so the
// verifier accepts the token-override ops (it rejects undeclared tokens).
const manifest = {
  appId: "app1",
  version: "1.0.0",
  designTokens: ROLE_TOKENS.map((name) => ({ name, kind: "color", value: "#000000" })),
  components: [],
  endpoints: [{ id: "list-items", method: "GET", path: "/api/items" }],
  policies: [],
  createdAt: "2026-06-10T00:00:00.000Z",
};

/** Base agent should never be consulted on the theme path; if it is, fail loud. */
function explodingBase(): MockAgent {
  const a = new MockAgent([{}]);
  a.generateDraft = () => Promise.reject(new Error("base agent must not run on a theme prompt"));
  return a;
}

describe("keystone: prompt -> StyleSpec -> compiled theme -> token-override ops", () => {
  it("publishes a verified bundle whose token values are the compiler's, not the LLM's", async () => {
    const store = new MemoryStore();
    await publishManifest(store, "app1", manifest);

    // Theme path: classify=true, designer returns a fixed StyleSpec (stands in
    // for the Designer LLM). The REAL compiler runs — deterministic, no API key.
    const agent = createDesignAwareAgent(explodingBase(), {
      classify: () => true,
      design: async () => spec,
    });

    const result = await authorMod({
      store, keys, agent, appId: "app1", subjectId: "u1", prompt: "make it retro arcade",
    });

    expect(result.ok, !result.ok ? JSON.stringify(result.reasons) : "").toBe(true);
    if (!result.ok) return;

    const bundle = JSON.parse(result.record.envelope.payload);
    const expected = compileTheme(spec).roles;
    const tokenOps = bundle.uiOps.filter((o: { type: string }) => o.type === "token-override");

    // Every compiled role token is present as a token-override, value-for-value.
    expect(tokenOps).toHaveLength(Object.keys(expected).length);
    expect(tokenOps).toHaveLength(ROLE_TOKENS.length);
    for (const op of tokenOps as Array<{ token: string; value: string }>) {
      expect(op.value, `token ${op.token}`).toBe(expected[op.token]);
    }

    // Provenance: the StyleSpec rides along; the compiler is stamped.
    expect(bundle.design?.compiledBy).toBeTruthy();
    expect(bundle.design?.styleSpec.mode).toBe(spec.mode);
  });

  it("routes non-theme prompts to the base agent unchanged", async () => {
    const store = new MemoryStore();
    await publishManifest(store, "app1", manifest);

    const baseDraft = { uiOps: [{ type: "token-override", token: "--inv-accent", value: "teal" }] };
    let designCalled = false;
    const agent = createDesignAwareAgent(new MockAgent([baseDraft]), {
      classify: () => false, // not a theme prompt
      design: async () => {
        designCalled = true;
        return spec;
      },
    });

    const result = await authorMod({
      store, keys, agent, appId: "app1", subjectId: "u1", prompt: "sort my list",
    });

    expect(result.ok).toBe(true);
    expect(designCalled).toBe(false);
    if (result.ok) {
      const bundle = JSON.parse(result.record.envelope.payload);
      expect(bundle.uiOps).toHaveLength(1);
      expect(bundle.design).toBeUndefined();
    }
  });

  it("preserves an existing API hook when a theme is applied on top", async () => {
    const store = new MemoryStore();
    await publishManifest(store, "app1", manifest);

    // First: a data hook (non-theme), via the base agent path.
    const hookDraft = {
      hooks: [
        {
          id: "hook_sort",
          trigger: { endpointId: "list-items", phase: "response" },
          language: "js",
          source: "(payload) => { payload.items.sort(); return payload; }",
        },
      ],
      capabilities: { reads: [], writes: [{ endpointId: "list-items", fields: ["items"] }], budgets: { cpuMs: 50, memMb: 32 } },
    };
    await authorMod({
      store, keys,
      agent: createDesignAwareAgent(new MockAgent([hookDraft]), { classify: () => false, design: async () => spec }),
      appId: "app1", subjectId: "u1", prompt: "sort my list",
    });

    // Then: a theme prompt. The hook must survive (data customizations aren't dropped).
    const themed = await authorMod({
      store, keys,
      agent: createDesignAwareAgent(explodingBase(), { classify: () => true, design: async () => spec }),
      appId: "app1", subjectId: "u1", prompt: "make it retro arcade",
    });

    expect(themed.ok, !themed.ok ? JSON.stringify(themed.reasons) : "").toBe(true);
    if (!themed.ok) return;
    const bundle = JSON.parse(themed.record.envelope.payload);
    expect(bundle.hooks).toHaveLength(1);
    expect(bundle.hooks[0].id).toBe("hook_sort");
    expect(bundle.uiOps.filter((o: { type: string }) => o.type === "token-override")).toHaveLength(ROLE_TOKENS.length);
  });
});
