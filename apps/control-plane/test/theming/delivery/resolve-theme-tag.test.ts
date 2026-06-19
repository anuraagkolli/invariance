// apps/control-plane/test/theming/delivery/resolve-theme-tag.test.ts
import { describe, it, expect } from "vitest";
import { resolveThemeTag } from "../../../src/theming/delivery/resolve-theme-tag.js";
import { hashArtifact } from "@invariance/theming";
import type { ThemeArtifact, Pointer } from "@invariance/theming";
import type { PointerStore, BlobStore } from "../../../src/theming/publish/stores.js";

function makeArtifact(overrides?: Partial<ThemeArtifact>): ThemeArtifact {
  return {
    schemaVersion: 1,
    vocabVersion: "iv-roles-1",
    profileVersion: "iv-profile-1",
    appId: "shadcn-can",
    modes: {
      light: { selector: ":root", vars: { "--background": "oklch(1 0 0)", "--foreground": "oklch(0.1 0 0)" } },
    },
    meta: { verifierReport: { ok: true }, contrastFloor: null, chromaCap: 0.4 },
    ...overrides,
  } as ThemeArtifact;
}

function stubStores(opts: {
  pointer: Pointer | null;
  artifactByHash: Map<string, ThemeArtifact>;
}): { pointer: PointerStore; blob: BlobStore } {
  return {
    pointer: {
      async getPointer() {
        return opts.pointer;
      },
      async putPointer() {},
    },
    blob: {
      async putArtifact() {},
      async getArtifact(hash: string) {
        return opts.artifactByHash.get(hash) ?? null;
      },
    },
  };
}

describe("resolveThemeTag", () => {
  it("happy path: returns a styleTag for the live pointer's artifact", async () => {
    const art = makeArtifact();
    const hash = hashArtifact(art);
    const stores = stubStores({
      pointer: { hash, status: "live", updatedAt: "2026-06-18T00:00:00Z" },
      artifactByHash: new Map([[hash, art]]),
    });
    const r = await resolveThemeTag({ tenant: "t1", mode: "light", nonce: "abc", stores });
    expect("tag" in r && typeof r.tag === "string").toBe(true);
    expect((r as { tag: string }).tag).toContain("<style");
    expect((r as { tag: string }).tag).toContain('nonce="abc"');
    expect((r as { tag: string }).tag).toContain("--background");
  });

  it("fails open on a pointer miss", async () => {
    const stores = stubStores({ pointer: null, artifactByHash: new Map() });
    const r = await resolveThemeTag({ tenant: "t1", mode: "light", nonce: "abc", stores });
    expect(r).toEqual({ tag: null, reason: "pointer_miss" });
  });

  it("fails open on a disabled (kill-switch) pointer — distinct from a miss", async () => {
    const stores = stubStores({
      pointer: { hash: "h", status: "disabled", updatedAt: "x" },
      artifactByHash: new Map(),
    });
    const r = await resolveThemeTag({ tenant: "t1", mode: "light", nonce: "abc", stores });
    expect(r).toEqual({ tag: null, reason: "pointer_disabled" });
  });

  it("fails open when the artifact is missing from the blob store", async () => {
    const stores = stubStores({
      pointer: { hash: "missing-hash", status: "live", updatedAt: "x" },
      artifactByHash: new Map(),
    });
    const r = await resolveThemeTag({ tenant: "t1", mode: "light", nonce: "abc", stores });
    expect(r).toEqual({ tag: null, reason: "artifact_missing" });
  });

  it("fails open on a hash mismatch (fetched artifact != pointer hash)", async () => {
    const art = makeArtifact();
    const stores = stubStores({
      pointer: { hash: "claimed-hash", status: "live", updatedAt: "x" },
      // store the real artifact UNDER the claimed (wrong) hash so getArtifact returns it
      artifactByHash: new Map([["claimed-hash", art]]),
    });
    const r = await resolveThemeTag({ tenant: "t1", mode: "light", nonce: "abc", stores });
    expect(r).toEqual({ tag: null, reason: "hash_mismatch" });
  });

  it("fails open on an unsafe value in the resolved mode", async () => {
    const bad = makeArtifact({
      modes: {
        light: {
          selector: ":root",
          vars: { "--background": "red; } body { display:none } :root{--x:1" },
        },
      } as ThemeArtifact["modes"],
    });
    const hash = hashArtifact(bad);
    const stores = stubStores({
      pointer: { hash, status: "live", updatedAt: "x" },
      artifactByHash: new Map([[hash, bad]]),
    });
    const r = await resolveThemeTag({ tenant: "t1", mode: "light", nonce: "abc", stores });
    expect(r).toEqual({ tag: null, reason: "unsafe_value" });
  });

  it("fails open when no nonce is supplied (CSP enforced)", async () => {
    const art = makeArtifact();
    const hash = hashArtifact(art);
    const stores = stubStores({
      pointer: { hash, status: "live", updatedAt: "x" },
      artifactByHash: new Map([[hash, art]]),
    });
    const r = await resolveThemeTag({ tenant: "t1", mode: "light", nonce: "", stores });
    expect(r).toEqual({ tag: null, reason: "no_nonce" });
  });
});
