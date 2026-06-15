import { ModLoader, applyOverlay, clearOverlay, requestRefix, submitPrompt } from "@invariance/client";
import { MockAgent } from "@invariance/control-plane";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import manifest from "../invariance.manifest.json";
import { publishDemoManifest, startControlPlane, type TestControlPlane } from "./helpers";

/**
 * Phase 5 exit criteria: ship a breaking demo-app change; mods degrade
 * gracefully (with reasons) and the AI re-fix path brings them back under the
 * new contract.
 */

// v1 mod: accent + radius overrides.
const v1Draft = {
  uiOps: [
    { type: "token-override", token: "--inv-accent", value: "teal" },
    { type: "token-override", token: "--inv-radius", value: "12px" },
  ],
};

// What the (mock) re-fix agent produces under the v2 manifest: the accent
// token is gone, so the surviving intent is expressed with what still exists.
const refixDraft = {
  uiOps: [
    { type: "token-override", token: "--inv-primary", value: "teal" },
    { type: "token-override", token: "--inv-radius", value: "12px" },
  ],
};

// Breaking release: --inv-accent renamed to --inv-primary.
const v2Manifest = {
  ...manifest,
  version: "2.0.0",
  designTokens: manifest.designTokens.map((t) =>
    t.name === "--inv-accent" ? { ...t, name: "--inv-primary" } : t,
  ),
};

let cp: TestControlPlane;
let agent: MockAgent;

beforeAll(async () => {
  agent = new MockAgent([v1Draft, refixDraft]);
  cp = await startControlPlane({ agent });
  await publishDemoManifest(cp.url);
});

afterAll(async () => {
  await cp.close();
});

describe("phase 5 exit criteria: breaking release -> degrade -> AI re-fix", () => {
  const config = { registryUrl: "", appId: "streamline", subjectId: "migrator" };

  it("a breaking manifest release marks the active mod stale", async () => {
    config.registryUrl = cp.url;
    const authored = await submitPrompt(config, "make the accent teal and cards rounder");
    expect(authored.ok).toBe(true);

    const publish = await fetch(`${cp.url}/v1/apps/streamline/manifest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(v2Manifest),
    });
    expect(publish.status).toBe(201);
    expect(((await publish.json()) as { staleMods: number }).staleMods).toBe(1);

    const pointer = await fetch(
      `${cp.url}/v1/apps/streamline/subjects/migrator/pointer`,
    ).then((r) => r.json());
    expect((pointer as { status: string }).status).toBe("stale");
  });

  it("the loader revalidates on next session and degrades with reasons", async () => {
    const loaded = await new ModLoader(config).load();
    expect(loaded.status).toBe("degraded");
    expect(loaded.bundle).toBeNull();
    expect((loaded.reasons ?? []).join()).toContain("--inv-accent");
  });

  it("re-fix re-authors from original prompts with degrade reasons as seed feedback", async () => {
    const result = await requestRefix(config);
    expect(result.ok).toBe(true);

    // The re-fix agent saw the original request and the degrade reasons.
    const refixInput = agent.inputs.at(-1)!;
    expect(refixInput.prompt).toContain("make the accent teal and cards rounder");
    expect(refixInput.feedback.join()).toContain("--inv-accent");

    const loaded = await new ModLoader(config).load();
    expect(loaded.status).toBe("active");
    expect(loaded.bundle?.binding.appManifestVersion).toBe("2.0.0");
    applyOverlay(loaded.bundle!);
    expect(document.documentElement.style.getPropertyValue("--inv-primary")).toBe("teal");
    expect(document.documentElement.style.getPropertyValue("--inv-radius")).toBe("12px");
    clearOverlay();
  });

  it("the synthetic re-fix instruction is not stored as a user prompt", async () => {
    const record = await cp.store.latestMod("streamline", "migrator");
    expect(record?.prompts).toEqual(["make the accent teal and cards rounder"]);
  });

  it("a compatible mod migrates automatically instead of degrading", async () => {
    // This subject's mod only touches a token that survived the v2 rename.
    const publish = await fetch(`${cp.url}/v1/apps/streamline/subjects/survivor/bundles`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        uiOps: [{ type: "token-override", token: "--inv-radius", value: "4px" }],
      }),
    });
    expect(publish.status).toBe(201);

    // Breaking-but-unrelated release: bump the version again.
    await publishDemoManifest(cp.url, { ...v2Manifest, version: "2.1.0" });
    const survivorConfig = { ...config, subjectId: "survivor" };
    const loaded = await new ModLoader(survivorConfig).load();
    expect(loaded.status).toBe("active");
    expect(loaded.bundle?.binding.appManifestVersion).toBe("2.1.0");

    const events = (await cp.store.listEvents("streamline")).map((e) => e.type);
    expect(events).toContain("mod_migrated");
    expect(events).toContain("mod_degraded");
    expect(events).toContain("mod_refixed");
  });
});
