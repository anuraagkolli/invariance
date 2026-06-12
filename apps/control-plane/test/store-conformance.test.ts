import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { AppManifestSchema, type SignedEnvelope } from "@invariance/schema";
import { migrate, PgStore, type SqlClient } from "../src/pg/pg-store";
import { MemoryStore, type ModRecord, type Store } from "../src/store";

const manifest = (version: string) =>
  AppManifestSchema.parse({
    appId: "app1",
    version,
    designTokens: [{ name: "--inv-x", kind: "color", value: "#000" }],
    createdAt: "2026-06-11T00:00:00.000Z",
  });

let hashCounter = 0;
function record(overrides: Partial<ModRecord> = {}): ModRecord {
  const n = ++hashCounter;
  const envelope: SignedEnvelope = {
    payload: JSON.stringify({ fake: n }),
    contentHash: `hash_${n}`,
    signature: "sig",
    keyId: "key1",
    alg: "ed25519",
  } as SignedEnvelope;
  return {
    modId: `mod_${n}`,
    appId: "app1",
    subjectId: "u1",
    revision: 0,
    contentHash: envelope.contentHash,
    envelope,
    status: "active",
    prompts: ["make it pop"],
    reasons: [],
    boundManifestVersion: "1.0.0",
    createdAt: "2026-06-11T00:00:00.000Z",
    ...overrides,
  };
}

/**
 * One behavioral contract, run against every Store implementation. Generous
 * timeout: PGlite's WASM init can take several seconds on a loaded machine.
 */
function conformance(name: string, makeStore: () => Promise<Store>) {
  describe(`${name} store conformance`, { timeout: 30_000 }, () => {
    it("stores manifests and tracks the current version", async () => {
      const store = await makeStore();
      expect(await store.currentManifest("app1")).toBeNull();
      await store.putManifest("app1", manifest("1.0.0"));
      await store.putManifest("app1", manifest("2.0.0"));
      expect((await store.currentManifest("app1"))?.version).toBe("2.0.0");
    });

    it("marks only active mods bound to other versions stale", async () => {
      const store = await makeStore();
      await store.insertMod(record({ modId: "m1", subjectId: "u1" }));
      await store.insertMod(
        record({ modId: "m2", subjectId: "u2", boundManifestVersion: "2.0.0" }),
      );
      await store.insertMod(record({ modId: "m3", subjectId: "u3", status: "disabled" }));
      const count = await store.markActiveModsStale("app1", "2.0.0");
      expect(count).toBe(1);
      expect((await store.findMod("app1", "m1"))?.status).toBe("stale");
      expect((await store.findMod("app1", "m2"))?.status).toBe("active");
      expect((await store.findMod("app1", "m3"))?.status).toBe("disabled");
    });

    it("returns subject history in insertion order and resolves the latest non-superseded", async () => {
      const store = await makeStore();
      await store.insertMod(record({ modId: "m1", revision: 0, status: "superseded" }));
      await store.insertMod(record({ modId: "m2", revision: 1 }));
      await store.insertMod(record({ modId: "m3", subjectId: "u2" }));
      const mods = await store.subjectMods("app1", "u1");
      expect(mods.map((m) => m.modId)).toEqual(["m1", "m2"]);
      expect((await store.latestMod("app1", "u1"))?.modId).toBe("m2");
      expect(await store.latestMod("app1", "ghost")).toBeNull();
      expect((await store.allMods("app1")).map((m) => m.modId).sort()).toEqual([
        "m1",
        "m2",
        "m3",
      ]);
    });

    it("round-trips record fields exactly", async () => {
      const store = await makeStore();
      const original = record({
        modId: "m1",
        prompts: ["first", "second"],
        reasons: ["why"],
        status: "degraded",
      });
      await store.insertMod(original);
      expect(await store.findMod("app1", "m1")).toEqual(original);
    });

    it("updates status and optionally reasons, returning the updated record", async () => {
      const store = await makeStore();
      await store.insertMod(record({ modId: "m1" }));
      const updated = await store.updateModStatus("app1", "m1", "degraded", ["token gone"]);
      expect(updated?.status).toBe("degraded");
      expect(updated?.reasons).toEqual(["token gone"]);
      // reasons untouched when not provided
      const again = await store.updateModStatus("app1", "m1", "active");
      expect(again?.reasons).toEqual(["token gone"]);
      expect(await store.updateModStatus("app1", "ghost", "active")).toBeNull();
    });

    it("stores bundles immutably by content hash", async () => {
      const store = await makeStore();
      const r = record();
      await store.putBundle("app1", r.envelope);
      await store.putBundle("app1", r.envelope); // idempotent
      expect(await store.getBundle("app1", r.contentHash)).toEqual(r.envelope);
      expect(await store.getBundle("app1", "missing")).toBeNull();
    });

    it("lists events chronologically with subject filter and recency limit", async () => {
      const store = await makeStore();
      for (let i = 0; i < 5; i++) {
        await store.addEvent({
          type: `t${i}`,
          appId: "app1",
          subjectId: i % 2 === 0 ? "u1" : "u2",
          at: 1000 + i,
          ...(i === 0 ? { detail: { n: i } } : {}),
        });
      }
      const all = await store.listEvents("app1");
      expect(all.map((e) => e.type)).toEqual(["t0", "t1", "t2", "t3", "t4"]);
      expect(all[0]?.detail).toEqual({ n: 0 });
      const u1 = await store.listEvents("app1", { subjectId: "u1" });
      expect(u1.map((e) => e.type)).toEqual(["t0", "t2", "t4"]);
      const recent = await store.listEvents("app1", { limit: 2 });
      expect(recent.map((e) => e.type)).toEqual(["t3", "t4"]);
    });

    it("keeps apps isolated", async () => {
      const store = await makeStore();
      await store.insertMod(record({ modId: "m1" }));
      await store.addEvent({ type: "x", appId: "app1", at: 1 });
      expect(await store.allMods("app2")).toEqual([]);
      expect(await store.listEvents("app2")).toEqual([]);
      expect(await store.findMod("app2", "m1")).toBeNull();
    });
  });
}

conformance("MemoryStore", async () => new MemoryStore());

conformance("PgStore (PGlite)", async () => {
  const db = new PGlite();
  await migrate(db as unknown as SqlClient);
  return new PgStore(db as unknown as SqlClient);
});
