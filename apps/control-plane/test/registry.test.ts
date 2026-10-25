import { describe, expect, it } from "vitest";
import { generateSigningKeyPair } from "@invariance/schema/signing";
import {
  assembleBundle,
  getPointer,
  publishBundle,
  publishManifest,
  setModStatus,
} from "../src/modules/registry";
import { MemoryStore } from "../src/store";

const keys = generateSigningKeyPair();

function manifestV(version: string) {
  return {
    appId: "app1",
    version,
    designTokens: [{ name: "--inv-x", kind: "color", value: "#000" }],
    components: [],
    endpoints: [{ id: "ep1", method: "GET", path: "/api/things" }],
    policies: [],
    createdAt: new Date().toISOString(),
  };
}

async function setup() {
  const store = new MemoryStore();
  await publishManifest(store, "app1", manifestV("1.0.0"));
  return store;
}

describe("registry", () => {
  it("assembles bundles bound to the current manifest with monotonic revisions", async () => {
    const store = await setup();
    const b0 = await assembleBundle(store, "app1", "u1", { uiOps: [] });
    await publishBundle(store, keys, b0, ["make it pop"]);
    const b1 = await assembleBundle(store, "app1", "u1", { uiOps: [] });
    expect(b0.revision).toBe(0);
    expect(b1.revision).toBe(1);
    expect(b1.binding.appManifestVersion).toBe("1.0.0");
  });

  it("supersedes the previous revision on publish", async () => {
    const store = await setup();
    await publishBundle(store, keys, await assembleBundle(store, "app1", "u1", {}), []);
    const second = await publishBundle(store, keys, await assembleBundle(store, "app1", "u1", {}), []);
    const mods = await store.subjectMods("app1", "u1");
    expect(mods.map((m) => m.status)).toEqual(["superseded", "active"]);
    expect(await getPointer(store, "app1", "u1")).toEqual({
      status: "active",
      contentHash: second.contentHash,
    });
  });

  it("marks active mods stale when a new manifest version ships", async () => {
    const store = await setup();
    await publishBundle(store, keys, await assembleBundle(store, "app1", "u1", {}), []);
    await publishBundle(store, keys, await assembleBundle(store, "app1", "u2", {}), []);
    const { staleCount } = await publishManifest(store, "app1", manifestV("1.1.0"));
    expect(staleCount).toBe(2);
    expect((await getPointer(store, "app1", "u1")).status).toBe("stale");
  });

  it("kill switch disables and re-enables a mod", async () => {
    const store = await setup();
    const record = await publishBundle(store, keys, await assembleBundle(store, "app1", "u1", {}), []);
    await setModStatus(store, "app1", record.modId, "disabled");
    expect((await getPointer(store, "app1", "u1")).status).toBe("disabled");
    await setModStatus(store, "app1", record.modId, "active");
    expect((await getPointer(store, "app1", "u1")).status).toBe("active");
  });

  it("rejects bundles when no manifest is published", async () => {
    const store = new MemoryStore();
    await expect(assembleBundle(store, "appX", "u1", {})).rejects.toThrow("no published manifest");
  });
});
