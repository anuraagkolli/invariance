import { describe, it, expect } from "vitest";
import type { ThemeArtifact, Pointer, StyleSpec, Verdict } from "@invariance/theming";
import { hashArtifact } from "@invariance/theming";
import {
  InMemoryBlobStore,
  InMemoryPointerStore,
  InMemoryAuditStore,
  type BlobStore,
  type PointerStore,
} from "../../../src/theming/publish/stores.js";
import { publish, setKillSwitch, type PublishInput, type PublishStores } from "../../../src/theming/publish/publisher.js";

const artifact: ThemeArtifact = {
  schemaVersion: 1,
  vocabVersion: "iv-roles-1",
  profileVersion: "iv-profile-1",
  appId: "nebula",
  modes: { light: { selector: ":root", vars: { "--background": "0 0% 100%" } } },
  meta: { verifierReport: { ok: true }, contrastFloor: 4.5, chromaCap: 0.4 },
};
const spec: StyleSpec = { colors: { primary: { l: 0.5, c: 0.2, h: 250 } } };
const okVerdict: Verdict = { ok: true };

const input = (over: Partial<PublishInput> = {}): PublishInput => ({
  tenant: "acme",
  artifact,
  styleSpec: spec,
  verifierReport: okVerdict,
  prompt: "make it blue",
  actor: "admin@acme",
  vocabVersion: "iv-roles-1",
  profileVersion: "iv-profile-1",
  ...over,
});

const stores = (): PublishStores & { blob: InMemoryBlobStore; pointer: InMemoryPointerStore; audit: InMemoryAuditStore } => ({
  blob: new InMemoryBlobStore(),
  pointer: new InMemoryPointerStore(),
  audit: new InMemoryAuditStore(),
});

const fixedNow = () => "2026-06-18T12:00:00.000Z";

describe("publish", () => {
  it("content-addresses the artifact, flips the pointer live, and records audit", async () => {
    const s = stores();
    const res = await publish(input(), s, { now: fixedNow });
    const expectedHash = hashArtifact(artifact);
    expect(res.hash).toBe(expectedHash);
    expect(res.pointer).toEqual({ hash: expectedHash, status: "live", updatedAt: "2026-06-18T12:00:00.000Z" });
    expect(await s.blob.getArtifact(expectedHash)).toEqual(artifact);
    expect(await s.pointer.getPointer("acme")).toEqual(res.pointer);
    const rec = await s.audit.getPublishedSpec("acme", expectedHash);
    expect(rec).toEqual({ styleSpec: spec, vocabVersion: "iv-roles-1", profileVersion: "iv-profile-1" });
    const logged = s.audit.listAudits()[0]!;
    expect(logged.prompt).toBe("make it blue");
    expect(logged.actor).toBe("admin@acme");
    expect(logged.timestamp).toBe("2026-06-18T12:00:00.000Z");
  });

  it("refuses a failed verdict — nothing is written anywhere", async () => {
    const s = stores();
    const failVerdict: Verdict = { ok: false, failures: [{ code: "contrast_floor", mode: "light", message: "x" }] };
    await expect(publish(input({ verifierReport: failVerdict }), s)).rejects.toThrow(/verdict/i);
    expect(s.audit.listAudits()).toHaveLength(0);
    expect(await s.pointer.getPointer("acme")).toBeNull();
  });

  it("write order is blob → pointer → audit (no pointer to a missing artifact on a mid-write crash)", async () => {
    const order: string[] = [];
    const expectedHash = hashArtifact(artifact);
    let blobbedHash: string | null = null;
    const blob: BlobStore = {
      async putArtifact(hash) { order.push("blob"); blobbedHash = hash; },
      async getArtifact() { return null; },
    };
    // pointer write throws AFTER blob, BEFORE audit — simulating a crash.
    const pointer: PointerStore = {
      async getPointer() { return null; },
      async putPointer() { order.push("pointer"); throw new Error("kv down"); },
    };
    const audit = new InMemoryAuditStore();
    await expect(
      publish(input(), { blob, pointer, audit }, { now: fixedNow }),
    ).rejects.toThrow(/kv down/);
    // blob ran first (with the content-addressed hash), pointer attempted,
    // audit NEVER ran ⇒ no pointer to a missing artifact.
    expect(order).toEqual(["blob", "pointer"]);
    expect(blobbedHash).toBe(expectedHash);
    expect(audit.listAudits()).toHaveLength(0);
  });
});

describe("setKillSwitch", () => {
  it("flips an existing pointer to disabled, preserving the hash", async () => {
    const ptr = new InMemoryPointerStore();
    const live: Pointer = { hash: "h1", status: "live", updatedAt: "2026-06-18T00:00:00.000Z" };
    await ptr.putPointer("acme", live);
    const next = await setKillSwitch("acme", "disabled", ptr, { now: fixedNow });
    expect(next).toEqual({ hash: "h1", status: "disabled", updatedAt: "2026-06-18T12:00:00.000Z" });
    expect((await ptr.getPointer("acme"))?.status).toBe("disabled");
  });

  it("throws when there is no pointer to flip (a kill-switch presupposes a publish)", async () => {
    const ptr = new InMemoryPointerStore();
    await expect(setKillSwitch("acme", "disabled", ptr)).rejects.toThrow(/no pointer/i);
  });
});
