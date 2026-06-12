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

async function seed(store: MemoryStore, token = "--a") {
  await publishManifest(store, "app1", manifest("1.0.0", ["--a", "--b"]));
  const bundle = await assembleBundle(store, "app1", "u1", {
    uiOps: [{ type: "token-override", token, value: "red" }],
  });
  return publishBundle(store, keys, bundle, ["make it red"]);
}

describe("revalidateSubject", () => {
  it("is a no-op for active (non-stale) subjects", async () => {
    const store = new MemoryStore();
    const record = await seed(store);
    const pointer = await revalidateSubject(store, keys, "app1", "u1");
    expect(pointer).toEqual({ status: "active", contentHash: record.contentHash });
    expect(await store.subjectMods("app1", "u1")).toHaveLength(1);
  });

  it("is a no-op for unknown subjects", async () => {
    const store = new MemoryStore();
    await publishManifest(store, "app1", manifest("1.0.0", ["--a"]));
    expect(await revalidateSubject(store, keys, "app1", "ghost")).toEqual({ status: "none" });
  });

  it("rebinds and re-signs a compatible stale mod", async () => {
    const store = new MemoryStore();
    const old = await seed(store);
    await publishManifest(store, "app1", manifest("2.0.0", ["--a", "--b"]));
    expect((await store.findMod("app1", old.modId))?.status).toBe("stale");

    const pointer = await revalidateSubject(store, keys, "app1", "u1");
    expect(pointer.status).toBe("active");
    expect(pointer.contentHash).not.toBe(old.contentHash);
    expect((await store.findMod("app1", old.modId))?.status).toBe("superseded");

    const migrated = (await store.latestMod("app1", "u1"))!;
    expect(migrated.boundManifestVersion).toBe("2.0.0");
    expect(migrated.prompts).toEqual(["make it red"]); // carried forward
    expect((await store.listEvents("app1")).map((e) => e.type)).toContain("mod_migrated");
  });

  it("degrades an incompatible stale mod with the verifier's reasons", async () => {
    const store = new MemoryStore();
    const record = await seed(store, "--a");
    await publishManifest(store, "app1", manifest("2.0.0", ["--b"])); // --a removed

    const pointer = await revalidateSubject(store, keys, "app1", "u1");
    expect(pointer.status).toBe("degraded");
    expect((pointer.reasons ?? []).join()).toContain("--a");
    expect((await store.findMod("app1", record.modId))?.status).toBe("degraded");
    expect((await getPointer(store, "app1", "u1")).status).toBe("degraded");
    expect((await store.listEvents("app1")).map((e) => e.type)).toContain("mod_degraded");
  });
});

describe("refixMod", () => {
  it("rejects subjects with nothing degraded", async () => {
    const store = new MemoryStore();
    await seed(store);
    const agent = new MockAgent([{}]);
    await expect(
      refixMod({ store, keys, agent, appId: "app1", subjectId: "u1" }),
    ).rejects.toThrow(/no degraded mod/);
  });

  it("keeps the record degraded when every repair attempt fails", async () => {
    const store = new MemoryStore();
    const record = await seed(store, "--a");
    await publishManifest(store, "app1", manifest("2.0.0", ["--b"]));
    await revalidateSubject(store, keys, "app1", "u1");

    const agent = new MockAgent([
      { uiOps: [{ type: "token-override", token: "--gone", value: "red" }] },
    ]);
    const result = await refixMod({ store, keys, agent, appId: "app1", subjectId: "u1" });
    expect(result.ok).toBe(false);
    expect((await store.findMod("app1", record.modId))?.status).toBe("degraded");
    expect((await getPointer(store, "app1", "u1")).status).toBe("degraded");
  });
});
