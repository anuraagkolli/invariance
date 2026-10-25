import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ModLoader, applyOverlay, clearOverlay, slotKey } from "@invariance/client";
import { publishDemoManifest, startControlPlane, type TestControlPlane } from "./helpers";

let cp: TestControlPlane;

beforeAll(async () => {
  cp = await startControlPlane();
  await publishDemoManifest(cp.url);
});

afterAll(async () => {
  await cp.close();
});

describe("phase 2 exit criteria: a published mod restyles the demo app", () => {
  it("publishes a hand-written bundle and applies it through the full loader path", async () => {
    const draft = {
      uiOps: [
        { type: "token-override", token: "--inv-accent", value: "#ff4d8d" },
        {
          type: "style-rule",
          selector: ".show-card",
          declarations: { border: "1px solid #ff4d8d" },
        },
        {
          type: "slot-override",
          componentId: "show-card",
          slot: "badge",
          content: '<span class="badge">★ Hand-picked</span>',
        },
      ],
    };
    const publishRes = await fetch(`${cp.url}/v1/apps/streamline/subjects/demo-user/bundles`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draft),
    });
    expect(publishRes.status).toBe(201);

    const loader = new ModLoader({
      registryUrl: cp.url,
      appId: "streamline",
      subjectId: "demo-user",
    });
    const loaded = await loader.load();
    expect(loaded.status).toBe("active");
    expect(loaded.bundle).not.toBeNull();

    const applied = applyOverlay(loaded.bundle!);
    expect(document.documentElement.style.getPropertyValue("--inv-accent")).toBe("#ff4d8d");
    expect(document.getElementById("invariance-overlay-styles")?.textContent).toContain(
      "[data-invariance-root] .show-card",
    );
    expect(applied.slotOverrides.get(slotKey("show-card", "badge"))).toContain("★ Hand-picked");
    clearOverlay();
  });

  it("returns base behavior for subjects with no mods", async () => {
    const loader = new ModLoader({
      registryUrl: cp.url,
      appId: "streamline",
      subjectId: "someone-else",
    });
    const loaded = await loader.load();
    expect(loaded.status).toBe("none");
    expect(loaded.bundle).toBeNull();
  });

  it("serves bundles as immutable content-addressed artifacts", async () => {
    const pointer = (await (
      await fetch(`${cp.url}/v1/apps/streamline/subjects/demo-user/pointer`)
    ).json()) as { status: string; contentHash: string };
    expect(pointer.status).toBe("active");

    const bundleRes = await fetch(`${cp.url}/v1/apps/streamline/bundles/${pointer.contentHash}`);
    expect(bundleRes.headers.get("cache-control")).toContain("immutable");
    const envelope = (await bundleRes.json()) as { contentHash: string };
    expect(envelope.contentHash).toBe(pointer.contentHash);
  });
});
