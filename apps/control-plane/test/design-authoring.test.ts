import { describe, expect, it } from "vitest";
import { generateSigningKeyPair } from "@invariance/schema/signing";
import { compileTheme, ROLE_TOKENS, THEME_PACKS, type StyleSpec } from "@invariance/design/server";
import { createControlPlane } from "../src/app";
import { MockAgent } from "../src/modules/authoring/mock";
import { MemoryStore } from "../src/store";

// Phase 5: the live control-plane wires the design-aware agent, so a theme
// prompt over HTTP produces a compiler-driven bundle. We inject the design deps
// (classify + a stub Designer) so the path is exercised deterministically — the
// only non-deterministic piece in production is the Designer LLM behind the key.
const keys = generateSigningKeyPair();
const spec: StyleSpec = THEME_PACKS[0]!.spec;

const manifest = {
  appId: "app1",
  version: "1.0.0",
  designTokens: ROLE_TOKENS.map((name) => ({ name, kind: "color", value: "#000000" })),
  components: [],
  endpoints: [],
  policies: [{ type: "design-constraint", id: "aa", contrast: 4.5 }],
  createdAt: "2026-06-10T00:00:00.000Z",
};

async function publishManifest(app: { request: typeof fetch | any }) {
  return app.request("/v1/apps/app1/manifest", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(manifest),
  });
}

describe("control-plane design-aware authoring", () => {
  it("routes a theme prompt through the compiler to a verified, published bundle", async () => {
    const store = new MemoryStore();
    const { app } = createControlPlane({
      store,
      keys,
      // The base agent must never run on a theme prompt.
      agent: { generateDraft: () => Promise.reject(new Error("base agent ran on a theme prompt")) },
      designAuthoring: { classify: () => true, design: async () => spec },
    });
    await publishManifest(app);

    const res = await app.request("/v1/apps/app1/subjects/u1/prompts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "make it retro and moody" }),
    });
    expect(res.status).toBe(201);

    const mod = await store.latestMod("app1", "u1");
    expect(mod?.status).toBe("active");
    const bundle = JSON.parse(mod!.envelope.payload);
    const expected = compileTheme(spec).roles;
    const tokenOps = bundle.uiOps.filter((o: { type: string }) => o.type === "token-override");
    expect(tokenOps).toHaveLength(ROLE_TOKENS.length);
    for (const op of tokenOps as Array<{ token: string; value: string }>) {
      expect(op.value, op.token).toBe(expected[op.token]);
    }
    expect(bundle.design.styleSpec.mode).toBe(spec.mode);
  });

  it("falls through to the base agent for non-theme prompts", async () => {
    const store = new MemoryStore();
    const baseDraft = { uiOps: [{ type: "token-override", token: "--inv-accent", value: "teal" }] };
    const { app } = createControlPlane({
      store,
      keys,
      agent: new MockAgent([baseDraft]),
      designAuthoring: {
        classify: () => false,
        design: async () => {
          throw new Error("Designer ran on a non-theme prompt");
        },
      },
    });
    await publishManifest(app);

    const res = await app.request("/v1/apps/app1/subjects/u1/prompts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "sort my list by date" }),
    });
    expect(res.status).toBe(201);

    const bundle = JSON.parse((await store.latestMod("app1", "u1"))!.envelope.payload);
    expect(bundle.uiOps).toHaveLength(1);
    expect(bundle.design).toBeUndefined();
  });
});
