import { AppManifestSchema } from "@invariance/schema";
import { generateSigningKeyPair } from "@invariance/schema/signing";
import { describe, expect, it } from "vitest";
import { MockAgent } from "../src/modules/authoring/mock";
import { refixMod } from "../src/modules/authoring/pipeline";
import {
  assembleBundle,
  getPointer,
  publishBundle,
  publishManifest,
  revalidateSubject,
} from "../src/modules/registry";
import { MemoryStore } from "../src/store";

const keys = generateSigningKeyPair();

const manifest = (version: string, tokens: string[]) =>
  AppManifestSchema.parse({
    appId: "app1",
    version,
    designTokens: tokens.map((name) => ({ name, kind: "color", value: "#111" })),
    createdAt: new Date().toISOString(),
  });

function seed(store: MemoryStore, token = "--a") {
  publishManifest(store, "app1", manifest("1.0.0", ["--a", "--b"]));
  const bundle = assembleBundle(store, "app1", "u1", {
    uiOps: [{ type: "token-override", token, value: "red" }],
  });
  return publishBundle(store, keys, bundle, ["make it red"]);
}

describe("revalidateSubject", () => {
  it("is a no-op for active (non-stale) subjects", () => {
    const store = new MemoryStore();
    const record = seed(store);
    const pointer = revalidateSubject(store, keys, "app1", "u1");
    expect(pointer).toEqual({ status: "active", contentHash: record.contentHash });
    expect(store.subjectMods("app1", "u1")).toHaveLength(1);
  });

  it("is a no-op for unknown subjects", () => {
    const store = new MemoryStore();
    publishManifest(store, "app1", manifest("1.0.0", ["--a"]));
    expect(revalidateSubject(store, keys, "app1", "ghost")).toEqual({ status: "none" });
  });

  it("rebinds and re-signs a compatible stale mod", () => {
    const store = new MemoryStore();
    const old = seed(store);
    publishManifest(store, "app1", manifest("2.0.0", ["--a", "--b"]));
    expect(old.status).toBe("stale");

    const pointer = revalidateSubject(store, keys, "app1", "u1");
    expect(pointer.status).toBe("active");
    expect(pointer.contentHash).not.toBe(old.contentHash);
    expect(old.status).toBe("superseded");

    const migrated = store.latestMod("app1", "u1")!;
    expect(migrated.boundManifestVersion).toBe("2.0.0");
    expect(migrated.prompts).toEqual(["make it red"]); // carried forward
    expect(store.app("app1").events.map((e) => e.type)).toContain("mod_migrated");
  });

  it("degrades an incompatible stale mod with the verifier's reasons", () => {
    const store = new MemoryStore();
    const record = seed(store, "--a");
    publishManifest(store, "app1", manifest("2.0.0", ["--b"])); // --a removed

    const pointer = revalidateSubject(store, keys, "app1", "u1");
    expect(pointer.status).toBe("degraded");
    expect((pointer.reasons ?? []).join()).toContain("--a");
    expect(record.status).toBe("degraded");
    expect(getPointer(store, "app1", "u1").status).toBe("degraded");
    expect(store.app("app1").events.map((e) => e.type)).toContain("mod_degraded");
  });
});

describe("refixMod", () => {
  it("rejects subjects with nothing degraded", async () => {
    const store = new MemoryStore();
    seed(store);
    const agent = new MockAgent([{}]);
    await expect(
      refixMod({ store, keys, agent, appId: "app1", subjectId: "u1" }),
    ).rejects.toThrow(/no degraded mod/);
  });

  it("keeps the record degraded when every repair attempt fails", async () => {
    const store = new MemoryStore();
    const record = seed(store, "--a");
    publishManifest(store, "app1", manifest("2.0.0", ["--b"]));
    revalidateSubject(store, keys, "app1", "u1");

    const agent = new MockAgent([
      { uiOps: [{ type: "token-override", token: "--gone", value: "red" }] },
    ]);
    const result = await refixMod({ store, keys, agent, appId: "app1", subjectId: "u1" });
    expect(result.ok).toBe(false);
    expect(record.status).toBe("degraded");
    expect(getPointer(store, "app1", "u1").status).toBe("degraded");
  });
});
