import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { AppManifestSchema } from "@invariance/schema";
import { generateSigningKeyPair } from "@invariance/schema/signing";
import { migrate, PgStore, type SqlClient } from "../src/pg/pg-store";
import {
  assembleBundle,
  getPointer,
  publishBundle,
  publishManifest,
  revalidateSubject,
  setModStatus,
} from "../src/modules/registry";

const keys = generateSigningKeyPair();

const manifest = (version: string, tokens: string[]) =>
  AppManifestSchema.parse({
    appId: "app1",
    version,
    designTokens: tokens.map((name) => ({ name, kind: "color", value: "#111" })),
    createdAt: new Date().toISOString(),
  });

async function pgStore() {
  const db = new PGlite();
  await migrate(db as unknown as SqlClient);
  return new PgStore(db as unknown as SqlClient);
}

// Generous timeout: PGlite's WASM init can take several seconds under load.
describe("registry lifecycle on PgStore", { timeout: 30_000 }, () => {
  it("publish -> supersede -> stale -> migrate -> kill, all against Postgres", async () => {
    const store = await pgStore();
    await publishManifest(store, "app1", manifest("1.0.0", ["--a", "--b"]));

    // Two revisions: the first must end superseded.
    await publishBundle(
      store,
      keys,
      await assembleBundle(store, "app1", "u1", {
        uiOps: [{ type: "token-override", token: "--a", value: "red" }],
      }),
      ["make it red"],
    );
    const second = await publishBundle(
      store,
      keys,
      await assembleBundle(store, "app1", "u1", {
        uiOps: [{ type: "token-override", token: "--a", value: "blue" }],
      }),
      ["make it red", "no, blue"],
    );
    expect((await store.subjectMods("app1", "u1")).map((m) => m.status)).toEqual([
      "superseded",
      "active",
    ]);
    expect(await getPointer(store, "app1", "u1")).toEqual({
      status: "active",
      contentHash: second.contentHash,
    });

    // Developer release keeps --a: stale, then migrates cleanly.
    await publishManifest(store, "app1", manifest("2.0.0", ["--a"]));
    expect((await getPointer(store, "app1", "u1")).status).toBe("stale");
    const migrated = await revalidateSubject(store, keys, "app1", "u1");
    expect(migrated.status).toBe("active");
    const latest = (await store.latestMod("app1", "u1"))!;
    expect(latest.boundManifestVersion).toBe("2.0.0");
    expect(latest.prompts).toEqual(["make it red", "no, blue"]); // jsonb round-trip

    // Signed envelope survived storage byte-for-byte: bundle still resolves.
    expect(await store.getBundle("app1", latest.contentHash)).toEqual(latest.envelope);

    // Kill switch.
    await setModStatus(store, "app1", latest.modId, "disabled");
    expect((await getPointer(store, "app1", "u1")).status).toBe("disabled");
  });

  it("degrades with reasons when the release breaks the mod", async () => {
    const store = await pgStore();
    await publishManifest(store, "app1", manifest("1.0.0", ["--a"]));
    await publishBundle(
      store,
      keys,
      await assembleBundle(store, "app1", "u1", {
        uiOps: [{ type: "token-override", token: "--a", value: "red" }],
      }),
      ["make it red"],
    );
    await publishManifest(store, "app1", manifest("2.0.0", ["--b"])); // --a gone

    const pointer = await revalidateSubject(store, keys, "app1", "u1");
    expect(pointer.status).toBe("degraded");
    expect((pointer.reasons ?? []).join()).toContain("--a");
    expect((await store.listEvents("app1")).map((e) => e.type)).toContain("mod_degraded");
  });
});
