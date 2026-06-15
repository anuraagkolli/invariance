import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ModLoader, applyOverlay, clearOverlay, submitPrompt } from "@invariance/client";
import { MockAgent } from "@invariance/control-plane";
import { publishDemoManifest, startControlPlane, type TestControlPlane } from "./helpers";

let cp: TestControlPlane;

const tealDraft = {
  uiOps: [{ type: "token-override", token: "--inv-accent", value: "teal" }],
};
const hostileDraft = {
  uiOps: [
    {
      type: "slot-override",
      componentId: "show-card",
      slot: "badge",
      content: "<script>steal()</script>",
    },
  ],
};

beforeAll(async () => {
  cp = await startControlPlane({ agent: new MockAgent([tealDraft, hostileDraft, hostileDraft, hostileDraft]) });
  await publishDemoManifest(cp.url);
});

afterAll(async () => {
  await cp.close();
});

describe("phase 3 exit criteria: type a prompt, the app changes", () => {
  const config = { registryUrl: "", appId: "streamline", subjectId: "prompter" };

  it("prompt -> authored, verified, signed, applied", async () => {
    config.registryUrl = cp.url;
    const result = await submitPrompt(config, "make the accent color teal");
    expect(result.ok).toBe(true);

    const loaded = await new ModLoader(config).load();
    expect(loaded.status).toBe("active");
    applyOverlay(loaded.bundle!);
    expect(document.documentElement.style.getPropertyValue("--inv-accent")).toBe("teal");
    clearOverlay();
  });

  it("hostile agent output is rejected by verification, previous mods stay intact", async () => {
    const result = await submitPrompt(config, "add a badge");
    expect(result.ok).toBe(false);
    expect((result.reasons ?? []).join()).toContain("unsafe slot content");

    const loaded = await new ModLoader(config).load();
    expect(loaded.status).toBe("active");
    expect(loaded.bundle?.uiOps).toHaveLength(1); // still the teal mod
  });
});
