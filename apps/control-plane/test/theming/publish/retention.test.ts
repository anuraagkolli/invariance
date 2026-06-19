import { describe, it, expect } from "vitest";
import type { StyleSpec, Verdict } from "@invariance/theming";
import { InMemoryAuditStore, type AuditRow } from "../../../src/theming/publish/stores.js";
import { referencedVersions, assertRetained } from "../../../src/theming/publish/retention.js";

const spec: StyleSpec = { radius: 8 };
const okVerdict: Verdict = { ok: true };

const row = (vocab: string, profile: string): AuditRow => ({
  tenant: "acme",
  hash: `${vocab}-${profile}`,
  prompt: "x",
  styleSpec: spec,
  verifierReport: okVerdict,
  actor: "admin",
  timestamp: "2026-06-18T00:00:00.000Z",
  vocabVersion: vocab,
  profileVersion: profile,
});

describe("referencedVersions", () => {
  it("collects every distinct vocab + profile version stamped in stored specs", async () => {
    const audit = new InMemoryAuditStore();
    await audit.recordAudit(row("iv-roles-1", "iv-profile-1"));
    await audit.recordAudit(row("iv-roles-1", "iv-profile-2"));
    const refs = referencedVersions(audit);
    expect([...refs.vocabVersions].sort()).toEqual(["iv-roles-1"]);
    expect([...refs.profileVersions].sort()).toEqual(["iv-profile-1", "iv-profile-2"]);
  });
});

describe("assertRetained", () => {
  it("rejects deleting a profile version still referenced by a stored spec", async () => {
    const audit = new InMemoryAuditStore();
    await audit.recordAudit(row("iv-roles-1", "iv-profile-1"));
    expect(() => assertRetained({ profileVersion: "iv-profile-1" }, audit)).toThrow(/iv-profile-1.*referenced/i);
  });

  it("rejects deleting a vocab version still referenced", async () => {
    const audit = new InMemoryAuditStore();
    await audit.recordAudit(row("iv-roles-1", "iv-profile-1"));
    expect(() => assertRetained({ vocabVersion: "iv-roles-1" }, audit)).toThrow(/iv-roles-1.*referenced/i);
  });

  it("allows deleting a version no stored spec references", async () => {
    const audit = new InMemoryAuditStore();
    await audit.recordAudit(row("iv-roles-1", "iv-profile-1"));
    expect(() => assertRetained({ profileVersion: "iv-profile-9" }, audit)).not.toThrow();
    expect(() => assertRetained({ vocabVersion: "iv-roles-9" }, audit)).not.toThrow();
  });
});
