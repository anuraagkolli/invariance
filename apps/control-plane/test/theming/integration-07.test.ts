// apps/control-plane/test/theming/integration-07.test.ts
import { describe, it, expect } from "vitest";
import { QwenAgent, buildEnvelope } from "../../src/theming/authoring/index.js";
import { resolveThemeTag, resolveBlockingScript } from "../../src/theming/delivery/index.js";
import { parseSpec, hashArtifact } from "@invariance/theming";
import { SHADCN_CAN } from "@invariance/theming";
import type { ThemeArtifact, Pointer } from "@invariance/theming";
import type { PointerStore, BlobStore } from "../../src/theming/publish/stores.js";

describe("Plan 07 integration: gatekeep → design → wall, and a delivery round-trip", () => {
  it("a scripted in-scope prompt produces a parseable sparse spec that crosses the wall", async () => {
    const env = buildEnvelope(SHADCN_CAN);
    const agent = new QwenAgent({
      chat: async ({ messages }) => {
        const isGate = messages.some((m) => m.content.includes("strict classifier"));
        return isGate
          ? '{"classification":"in_scope_styling"}'
          : '{"colors":{"accent":"oklch(0.7 0.15 60)"}}';
      },
    });
    const gate = await agent.gatekeep({ prompt: "make it orange", envelope: env });
    expect(gate.classification).toBe("in_scope_styling");
    const { specJson } = await agent.design({ prompt: "make it orange", draft: {} as any, envelope: env });
    expect(parseSpec(specJson, SHADCN_CAN).ok).toBe(true);
  });

  it("delivery serves a live artifact and fails open on a kill-switch", async () => {
    const art: ThemeArtifact = {
      schemaVersion: 1,
      vocabVersion: "iv-roles-1",
      profileVersion: "iv-profile-1",
      appId: "shadcn-can",
      modes: { light: { selector: ":root", vars: { "--background": "oklch(1 0 0)" } } },
      meta: { verifierReport: { ok: true }, contrastFloor: null, chromaCap: 0.4 },
    } as ThemeArtifact;
    const hash = hashArtifact(art);
    let pointer: Pointer = { hash, status: "live", updatedAt: "x" };
    const stores: { pointer: PointerStore; blob: BlobStore } = {
      pointer: { async getPointer() { return pointer; }, async putPointer() {} },
      blob: { async putArtifact() {}, async getArtifact(h) { return h === hash ? art : null; } },
    };
    const live = await resolveThemeTag({ tenant: "t", mode: "light", nonce: "n", stores });
    expect("tag" in live && typeof (live as any).tag === "string").toBe(true);

    // the fallback (blocking-script) tier resolves the SAME artifact via the SAME fail-open path
    const liveScript = await resolveBlockingScript({ tenant: "t", mode: "light", nonce: "n", stores });
    expect("script" in liveScript && typeof (liveScript as any).script === "string").toBe(true);

    pointer = { hash, status: "disabled", updatedAt: "x" };
    const killed = await resolveThemeTag({ tenant: "t", mode: "light", nonce: "n", stores });
    expect(killed).toEqual({ tag: null, reason: "pointer_disabled" });
    const killedScript = await resolveBlockingScript({ tenant: "t", mode: "light", nonce: "n", stores });
    expect(killedScript).toEqual({ script: null, reason: "pointer_disabled" });
  });
});
