import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { AppManifestSchema, type SignedEnvelope } from "@invariance/schema";
import { migrate, PgStore, type SqlClient } from "../src/pg/pg-store";
import { MemoryStore, type ModRecord, type Store, type ThemeVersionMeta } from "../src/store";

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

    it("round-trips design-config (defaults to {})", async () => {
      const store = await makeStore();
      expect(await store.getDesignConfig("app1")).toEqual({});
      await store.putDesignConfig("app1", { contrastFloor: 7 });
      expect(await store.getDesignConfig("app1")).toEqual({ contrastFloor: 7 });
    });

    // ── Theme version timeline ────────────────────────────────────────────────

    it("theme timeline: empty state returns null / [] / []", async () => {
      const store = await makeStore();
      expect(await store.getLatestTheme("app1", "u1")).toBeNull();
      expect(await store.listThemeVersions("app1", "u1")).toEqual([]);
      expect(await store.listThemeTimelines("app1")).toEqual([]);
    });

    it("theme timeline: append returns entry, getLatestTheme returns latest theme", async () => {
      const store = await makeStore();
      const theme1 = { background: "#000", foreground: "#fff" };
      const theme2 = { background: "#111", foreground: "#eee" };
      const entry1 = await store.appendThemeVersion("app1", "u1", theme1);
      expect(entry1.seq).toBe(1);
      expect(entry1.theme).toEqual(theme1);
      expect(typeof entry1.at).toBe("string");
      // ISO round-trip: rejects "garbage" and any non-canonical form
      expect(new Date(entry1.at).toISOString()).toBe(entry1.at);
      expect(await store.getLatestTheme("app1", "u1")).toEqual(theme1);
      const entry2 = await store.appendThemeVersion("app1", "u1", theme2);
      expect(entry2.seq).toBe(2);
      expect(await store.getLatestTheme("app1", "u1")).toEqual(theme2);
      // Newer entry's at must be >= older entry's at (string comparison is valid for ISO)
      expect(entry2.at >= entry1.at).toBe(true);
    });

    it("theme timeline: listThemeVersions returns newest-first with monotonic seq", async () => {
      const store = await makeStore();
      const themeA = { color: "red" };
      const themeB = { color: "blue" };
      const themeC = { color: "green" };
      await store.appendThemeVersion("app1", "u1", themeA);
      await store.appendThemeVersion("app1", "u1", themeB);
      await store.appendThemeVersion("app1", "u1", themeC);
      const versions = await store.listThemeVersions("app1", "u1");
      expect(versions.length).toBe(3);
      // newest first
      expect(versions[0]!.theme).toEqual(themeC);
      expect(versions[1]!.theme).toEqual(themeB);
      expect(versions[2]!.theme).toEqual(themeA);
      // seq monotonic
      expect(versions[0]!.seq).toBe(3);
      expect(versions[1]!.seq).toBe(2);
      expect(versions[2]!.seq).toBe(1);
      // at present on all
      for (const v of versions) {
        expect(typeof v.at).toBe("string");
      }
    });

    it("theme timeline: meta round-trip and absent-meta entries have no meta key", async () => {
      const store = await makeStore();
      const meta: ThemeVersionMeta = { prompt: "make it teal", source: "pipeline" };
      const withMeta = await store.appendThemeVersion("app1", "u1", { color: "teal" }, meta);
      const withoutMeta = await store.appendThemeVersion("app1", "u1", { color: "red" });
      expect(withMeta.meta).toEqual(meta);
      // No meta key present (not undefined-valued, actually absent)
      expect("meta" in withoutMeta).toBe(false);
      // Round-trip from listThemeVersions (newest first: withoutMeta is index 0)
      const versions = await store.listThemeVersions("app1", "u1");
      expect(versions[0]!.meta).toBeUndefined();
      expect("meta" in versions[0]!).toBe(false);
      expect(versions[1]!.meta).toEqual(meta);
    });

    it("theme timeline: listThemeTimelines summarizes per user, is app-scoped", async () => {
      const store = await makeStore();
      await store.appendThemeVersion("app1", "u1", { a: 1 });
      await store.appendThemeVersion("app1", "u1", { a: 2 });
      await store.appendThemeVersion("app1", "u2", { b: 1 });
      // Different app — should not appear in app1 summary
      await store.appendThemeVersion("app2", "u1", { c: 1 });

      const timelines = await store.listThemeTimelines("app1");
      expect(timelines.length).toBe(2);
      const byUser = Object.fromEntries(timelines.map((t) => [t.userId, t]));
      expect(byUser["u1"]!.count).toBe(2);
      expect(typeof byUser["u1"]!.latestAt).toBe("string");
      expect(byUser["u2"]!.count).toBe(1);
      // app2 is isolated
      const app2Timelines = await store.listThemeTimelines("app2");
      expect(app2Timelines.length).toBe(1);
      expect(app2Timelines[0]!.userId).toBe("u1");
      // app3 sees nothing
      expect(await store.listThemeTimelines("app3")).toEqual([]);
    });

    it("theme timeline: cap at 50, seq never reused, oldest entries pruned", async () => {
      const store = await makeStore();
      for (let i = 1; i <= 55; i++) {
        await store.appendThemeVersion("app1", "u1", { n: i });
      }
      const versions = await store.listThemeVersions("app1", "u1");
      // Capped at 50
      expect(versions.length).toBe(50);
      // Newest seq is 55
      expect(versions[0]!.seq).toBe(55);
      // Oldest retained seq is 6 (entries 1-5 pruned)
      expect(versions[versions.length - 1]!.seq).toBe(6);
      // seq strictly decreasing (monotonic, no reuse)
      for (let i = 0; i < versions.length - 1; i++) {
        expect(versions[i]!.seq).toBeGreaterThan(versions[i + 1]!.seq);
      }
      // Cross-user isolation: pruning u1's timeline must not affect a different user's timeline
      await store.appendThemeVersion("app1", "u2", { n: 1 });
      const u2versions = await store.listThemeVersions("app1", "u2");
      expect(u2versions.length).toBe(1);
      expect(u2versions[0]!.seq).toBe(1);
    });
  });
}

conformance("MemoryStore", async () => new MemoryStore());

conformance("PgStore (PGlite)", async () => {
  const db = new PGlite();
  await migrate(db as unknown as SqlClient);
  return new PgStore(db as unknown as SqlClient);
});
