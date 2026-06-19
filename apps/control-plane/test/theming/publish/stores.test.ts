import { describe, it, expect } from "vitest";
import type { ThemeArtifact, Pointer, StyleSpec, Verdict } from "@invariance/theming";
import {
  InMemoryBlobStore,
  InMemoryPointerStore,
  InMemoryAuditStore,
  type AuditRow,
} from "../../../src/theming/publish/stores.js";

const artifact = (appId: string): ThemeArtifact => ({
  schemaVersion: 1,
  vocabVersion: "iv-roles-1",
  profileVersion: "iv-profile-1",
  appId,
  modes: { light: { selector: ":root", vars: { "--background": "0 0% 100%" } } },
  meta: { verifierReport: { ok: true }, contrastFloor: 4.5, chromaCap: 0.4 },
});

const spec: StyleSpec = { colors: { primary: { l: 0.5, c: 0.2, h: 250 } } };
const okVerdict: Verdict = { ok: true };

const row = (tenant: string, hash: string): AuditRow => ({
  tenant,
  hash,
  prompt: "make it blue",
  styleSpec: spec,
  verifierReport: okVerdict,
  actor: "admin@acme",
  timestamp: "2026-06-18T00:00:00.000Z",
  vocabVersion: "iv-roles-1",
  profileVersion: "iv-profile-1",
});

describe("InMemoryBlobStore", () => {
  it("round-trips an artifact by hash and is idempotent", async () => {
    const blob = new InMemoryBlobStore();
    await blob.putArtifact("h1", artifact("nebula"));
    await blob.putArtifact("h1", artifact("nebula")); // idempotent
    expect(await blob.getArtifact("h1")).toEqual(artifact("nebula"));
  });

  it("returns null for a missing hash", async () => {
    const blob = new InMemoryBlobStore();
    expect(await blob.getArtifact("nope")).toBeNull();
  });
});

describe("InMemoryPointerStore", () => {
  it("returns null for a pointer MISS (distinct from disabled)", async () => {
    const ptr = new InMemoryPointerStore();
    expect(await ptr.getPointer("acme")).toBeNull();
  });

  it("round-trips a live pointer and overwrites on re-put", async () => {
    const ptr = new InMemoryPointerStore();
    const live: Pointer = { hash: "h1", status: "live", updatedAt: "2026-06-18T00:00:00.000Z" };
    await ptr.putPointer("acme", live);
    expect(await ptr.getPointer("acme")).toEqual(live);
    const disabled: Pointer = { hash: "h1", status: "disabled", updatedAt: "2026-06-18T01:00:00.000Z" };
    await ptr.putPointer("acme", disabled);
    expect((await ptr.getPointer("acme"))?.status).toBe("disabled");
  });
});

describe("InMemoryAuditStore", () => {
  it("records rows and reads the published spec back by (tenant, hash)", async () => {
    const audit = new InMemoryAuditStore();
    await audit.recordAudit(row("acme", "h1"));
    const rec = await audit.getPublishedSpec("acme", "h1");
    expect(rec).toEqual({ styleSpec: spec, vocabVersion: "iv-roles-1", profileVersion: "iv-profile-1" });
  });

  it("returns null when the (tenant, hash) pair was never recorded", async () => {
    const audit = new InMemoryAuditStore();
    await audit.recordAudit(row("acme", "h1"));
    expect(await audit.getPublishedSpec("acme", "other-hash")).toBeNull();
    expect(await audit.getPublishedSpec("other-tenant", "h1")).toBeNull();
  });

  it("exposes the full append-only log via listAudits()", async () => {
    const audit = new InMemoryAuditStore();
    await audit.recordAudit(row("acme", "h1"));
    await audit.recordAudit(row("acme", "h2"));
    expect(audit.listAudits().map((r) => r.hash)).toEqual(["h1", "h2"]);
  });
});
