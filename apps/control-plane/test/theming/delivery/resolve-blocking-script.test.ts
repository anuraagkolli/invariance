// apps/control-plane/test/theming/delivery/resolve-blocking-script.test.ts
import { describe, it, expect } from "vitest";
import { resolveBlockingScript } from "../../../src/theming/delivery/resolve-blocking-script.js";
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

describe("resolveBlockingScript (the fallback delivery tier)", () => {
  it("happy path: emits a nonced blocking <script> that injects the resolved CSS at end of <head>", async () => {
    const art = makeArtifact();
    const hash = hashArtifact(art);
    const stores = stubStores({
      pointer: { hash, status: "live", updatedAt: "2026-06-18T00:00:00Z" },
      artifactByHash: new Map([[hash, art]]),
    });
    const r = await resolveBlockingScript({ tenant: "t1", mode: "light", nonce: "abc", stores });
    expect("script" in r && typeof r.script === "string").toBe(true);
    const script = (r as { script: string }).script;
    expect(script.startsWith('<script nonce="abc">')).toBe(true);
    expect(script.endsWith("</script>")).toBe(true);
    // it carries the resolved CSS text and appends to <head>
    expect(script).toContain("--background");
    expect(script).toContain("appendChild");
    expect(script).toContain("head");
    // no raw </script> sequence may survive un-escaped inside the inline script body
    expect(script.slice("<script nonce=\"abc\">".length, -"</script>".length)).not.toContain("</script");
  });

  it("fails open on a pointer miss (script: null, distinct reason)", async () => {
    const stores = stubStores({ pointer: null, artifactByHash: new Map() });
    const r = await resolveBlockingScript({ tenant: "t1", mode: "light", nonce: "abc", stores });
    expect(r).toEqual({ script: null, reason: "pointer_miss" });
  });

  it("fails open on a disabled (kill-switch) pointer — distinct from a miss", async () => {
    const stores = stubStores({
      pointer: { hash: "h", status: "disabled", updatedAt: "x" },
      artifactByHash: new Map(),
    });
    const r = await resolveBlockingScript({ tenant: "t1", mode: "light", nonce: "abc", stores });
    expect(r).toEqual({ script: null, reason: "pointer_disabled" });
  });

  it("fails open when the artifact is missing from the blob store", async () => {
    const stores = stubStores({
      pointer: { hash: "missing-hash", status: "live", updatedAt: "x" },
      artifactByHash: new Map(),
    });
    const r = await resolveBlockingScript({ tenant: "t1", mode: "light", nonce: "abc", stores });
    expect(r).toEqual({ script: null, reason: "artifact_missing" });
  });

  it("fails open on a hash mismatch (fetched artifact != pointer hash)", async () => {
    const art = makeArtifact();
    const stores = stubStores({
      pointer: { hash: "claimed-hash", status: "live", updatedAt: "x" },
      artifactByHash: new Map([["claimed-hash", art]]),
    });
    const r = await resolveBlockingScript({ tenant: "t1", mode: "light", nonce: "abc", stores });
    expect(r).toEqual({ script: null, reason: "hash_mismatch" });
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
    const r = await resolveBlockingScript({ tenant: "t1", mode: "light", nonce: "abc", stores });
    expect(r).toEqual({ script: null, reason: "unsafe_value" });
  });

  it("fails open when no nonce is supplied (CSP enforced)", async () => {
    const art = makeArtifact();
    const hash = hashArtifact(art);
    const stores = stubStores({
      pointer: { hash, status: "live", updatedAt: "x" },
      artifactByHash: new Map([[hash, art]]),
    });
    const r = await resolveBlockingScript({ tenant: "t1", mode: "light", nonce: "", stores });
    expect(r).toEqual({ script: null, reason: "no_nonce" });
  });
});
