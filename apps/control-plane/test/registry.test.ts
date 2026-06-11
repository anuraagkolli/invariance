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

function setup() {
  const store = new MemoryStore();
  publishManifest(store, "app1", manifestV("1.0.0"));
  return store;
}

describe("registry", () => {
  it("assembles bundles bound to the current manifest with monotonic revisions", () => {
    const store = setup();
    const b0 = assembleBundle(store, "app1", "u1", { uiOps: [] });
    publishBundle(store, keys, b0, ["make it pop"]);
    const b1 = assembleBundle(store, "app1", "u1", { uiOps: [] });
    expect(b0.revision).toBe(0);
    expect(b1.revision).toBe(1);
    expect(b1.binding.appManifestVersion).toBe("1.0.0");
  });

  it("supersedes the previous revision on publish", () => {
    const store = setup();
    publishBundle(store, keys, assembleBundle(store, "app1", "u1", {}), []);
    const second = publishBundle(store, keys, assembleBundle(store, "app1", "u1", {}), []);
    const mods = store.subjectMods("app1", "u1");
    expect(mods.map((m) => m.status)).toEqual(["superseded", "active"]);
    expect(getPointer(store, "app1", "u1")).toEqual({
      status: "active",
      contentHash: second.contentHash,
    });
  });

  it("marks active mods stale when a new manifest version ships", () => {
    const store = setup();
    publishBundle(store, keys, assembleBundle(store, "app1", "u1", {}), []);
    publishBundle(store, keys, assembleBundle(store, "app1", "u2", {}), []);
    const { staleCount } = publishManifest(store, "app1", manifestV("1.1.0"));
    expect(staleCount).toBe(2);
    expect(getPointer(store, "app1", "u1").status).toBe("stale");
  });

  it("kill switch disables and re-enables a mod", () => {
    const store = setup();
    const record = publishBundle(store, keys, assembleBundle(store, "app1", "u1", {}), []);
    setModStatus(store, "app1", record.modId, "disabled");
    expect(getPointer(store, "app1", "u1").status).toBe("disabled");
    setModStatus(store, "app1", record.modId, "active");
    expect(getPointer(store, "app1", "u1").status).toBe("active");
  });

  it("rejects bundles when no manifest is published", () => {
    const store = new MemoryStore();
    expect(() => assembleBundle(store, "appX", "u1", {})).toThrow("no published manifest");
  });
});
