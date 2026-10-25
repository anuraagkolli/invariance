// Live end-to-end design run against a local OpenAI-compatible model (qwen via
// Ollama by default — no Anthropic key). Drives a real prompt through the full
// authoring pipeline: classify -> qwen Designer emits a StyleSpec -> the
// deterministic compiler picks every colour -> verifier gates it -> signed
// bundle. The LLM never picks a colour value; it only emits design intent.
//
//   ollama serve            # qwen2.5 already pulled
//   pnpm --filter @invariance/control-plane exec tsx scripts/live-design.ts "make it warm and editorial"
import { generateSigningKeyPair } from "@invariance/schema/signing";
import { ROLE_TOKENS, verifyRoleQuality } from "@invariance/design/server";
import { createControlPlane } from "../src/app";
import { MemoryStore } from "../src/store";

// Default the LLM transport to local Ollama/qwen; both the base agent and the
// design path infer the OpenAI-compatible provider from this base URL.
process.env.INVARIANCE_LLM_BASE_URL ??= "http://localhost:11434/v1";
process.env.INVARIANCE_LLM_MODEL ??= "qwen2.5:latest";

const prompt = process.argv[2] ?? "make it warm, editorial, and high-contrast";
const store = new MemoryStore();
const { app } = createControlPlane({ store, keys: generateSigningKeyPair() });

const manifest = {
  appId: "demo",
  version: "1.0.0",
  designTokens: ROLE_TOKENS.map((name) => ({ name, kind: "color", value: "#000000" })),
  components: [],
  endpoints: [],
  policies: [{ type: "design-constraint", id: "aa", contrast: 4.5 }],
  createdAt: "2026-06-13T00:00:00.000Z",
};
await app.request("/v1/apps/demo/manifest", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(manifest),
});

console.log(`\nModel:  ${process.env.INVARIANCE_LLM_MODEL} via ${process.env.INVARIANCE_LLM_BASE_URL}`);
console.log(`Prompt: ${JSON.stringify(prompt)}\n`);

const t0 = Date.now();
const res = await app.request("/v1/apps/demo/subjects/u1/prompts", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ prompt }),
});
const secs = ((Date.now() - t0) / 1000).toFixed(1);
const body = (await res.json()) as Record<string, unknown>;
console.log(`Authoring: HTTP ${res.status} in ${secs}s`);
if (res.status !== 201) {
  console.error("FAILED:", JSON.stringify(body, null, 2));
  process.exit(1);
}

const mod = await store.latestMod("demo", "u1");
const bundle = JSON.parse(mod!.envelope.payload);

console.log("\n--- qwen's StyleSpec (design intent — the LLM picks NO colours) ---");
console.log(JSON.stringify(bundle.design.styleSpec, null, 2));

const tokens: Record<string, string> = Object.fromEntries(
  bundle.uiOps.filter((o: { type: string }) => o.type === "token-override").map((o: { token: string; value: string }) => [o.token, o.value]),
);
console.log("\n--- a few compiler-chosen role tokens ---");
for (const t of ["--inv-surface-0", "--inv-text-primary", "--inv-accent", "--inv-accent-contrast"]) {
  console.log(`  ${t.padEnd(24)} ${tokens[t]}`);
}
console.log(`\nToken-overrides emitted: ${Object.keys(tokens).length} / ${ROLE_TOKENS.length}`);
const reasons = verifyRoleQuality(tokens, { contrastFloor: 4.5 });
console.log(`Design-quality gate:     ${reasons.length === 0 ? "PASS (WCAG AA)" : "FAIL — " + reasons.join("; ")}`);
const ptr = (await (await app.request("/v1/apps/demo/subjects/u1/pointer")).json()) as { status: string };
console.log(`Pointer status:          ${ptr.status}`);
