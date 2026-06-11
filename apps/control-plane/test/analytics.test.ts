import { AppManifestSchema, ModBundleSchema } from "@invariance/schema";
import { describe, expect, it } from "vitest";
import { createControlPlane } from "../src/app";
import { classifyBundle } from "../src/modules/analytics";

const manifest = AppManifestSchema.parse({
  appId: "app1",
  version: "1.0.0",
  designTokens: [
    { name: "--a", kind: "color", value: "#111" },
    { name: "--b", kind: "color", value: "#222" },
  ],
  components: [{ id: "card", name: "Card", slots: [{ name: "badge", overridable: true }] }],
  endpoints: [{ id: "list", method: "GET", path: "/api/list" }],
  createdAt: new Date().toISOString(),
});

describe("classifyBundle", () => {
  it("derives surfaces, tokens, components, endpoints, and phases", () => {
    const bundle = ModBundleSchema.parse({
      id: "m1",
      appId: "app1",
      subjectId: "u1",
      revision: 0,
      binding: { appManifestVersion: "1.0.0" },
      uiOps: [
        { type: "token-override", token: "--a", value: "red" },
        { type: "token-override", token: "--b", value: "blue" },
        { type: "style-rule", selector: ".x", declarations: { color: "red" } },
        { type: "slot-override", componentId: "card", slot: "badge", content: "<b>hi</b>" },
      ],
      hooks: [
        { id: "h1", trigger: { endpointId: "list", phase: "response" }, language: "js", source: "(p) => p" },
      ],
      capabilities: { reads: [{ endpointId: "list" }], writes: [], budgets: { cpuMs: 50, memMb: 32 } },
      createdAt: new Date().toISOString(),
    });
    expect(classifyBundle(bundle)).toEqual({
      surfaces: { tokens: 2, styles: 1, slots: 1, hooks: 1 },
      tokensTouched: ["--a", "--b"],
      componentsTouched: ["card.badge"],
      endpointsHooked: ["list"],
      phases: ["response"],
    });
  });
});

describe("analytics + mods admin endpoints", () => {
  async function seededPlane() {
    const cp = createControlPlane();
    await cp.app.request("/v1/apps/app1/manifest", {
      method: "POST",
      body: JSON.stringify(manifest),
      headers: { "content-type": "application/json" },
    });
    const published = await cp.app.request("/v1/apps/app1/subjects/u1/bundles", {
      method: "POST",
      body: JSON.stringify({ uiOps: [{ type: "token-override", token: "--a", value: "red" }] }),
      headers: { "content-type": "application/json" },
    });
    const { modId } = (await published.json()) as { modId: string };
    return { cp, modId };
  }

  it("ingests sendBeacon-style events without a content-type, leniently", async () => {
    const { cp } = await seededPlane();
    const accepted = await cp.app.request("/v1/apps/app1/events", {
      method: "POST",
      body: JSON.stringify({ type: "mods_applied", subjectId: "u1" }),
    });
    expect(accepted.status).toBe(202);

    const garbage = await cp.app.request("/v1/apps/app1/events", {
      method: "POST",
      body: "not json at all",
    });
    expect(garbage.status).toBe(202); // dropped, never errored

    const summary = (await (await cp.app.request("/v1/apps/app1/analytics/summary")).json()) as {
      events: { total: number; byType: Record<string, number> };
    };
    expect(summary.events.byType["mods_applied"]).toBe(1);
  });

  it("summarizes mods, tokens, and prompts across subjects", async () => {
    const { cp } = await seededPlane();
    const summary = (await (await cp.app.request("/v1/apps/app1/analytics/summary")).json()) as {
      mods: { total: number; byStatus: Record<string, number> };
      topTokens: Array<{ name: string; count: number }>;
    };
    expect(summary.mods.byStatus["active"]).toBe(1);
    expect(summary.topTokens[0]).toEqual({ name: "--a", count: 1 });
  });

  it("lists mods with classification and without envelope payloads", async () => {
    const { cp, modId } = await seededPlane();
    const body = (await (await cp.app.request("/v1/apps/app1/mods")).json()) as {
      mods: Array<Record<string, unknown>>;
    };
    expect(body.mods).toHaveLength(1);
    expect(body.mods[0]!.modId).toBe(modId);
    expect(body.mods[0]!.envelope).toBeUndefined();
    expect((body.mods[0]!.classification as { surfaces: { tokens: number } }).surfaces.tokens).toBe(1);
  });

  it("kill flips the pointer to disabled; restore brings it back", async () => {
    const { cp, modId } = await seededPlane();
    const pointer = async () =>
      (await (await cp.app.request("/v1/apps/app1/subjects/u1/pointer")).json()) as {
        status: string;
      };

    expect((await pointer()).status).toBe("active");
    const killed = await cp.app.request(`/v1/apps/app1/mods/${modId}/kill`, { method: "POST" });
    expect(killed.status).toBe(200);
    expect((await pointer()).status).toBe("disabled");

    const restored = await cp.app.request(`/v1/apps/app1/mods/${modId}/restore`, { method: "POST" });
    expect(restored.status).toBe(200);
    expect((await pointer()).status).toBe("active");

    const types = cp.store.app("app1").events.map((e) => e.type);
    expect(types).toContain("mod_killed");
    expect(types).toContain("mod_restored");
  });

  it("superseded history cannot be killed or restored", async () => {
    const { cp, modId } = await seededPlane();
    // Publish a second revision, superseding the first.
    await cp.app.request("/v1/apps/app1/subjects/u1/bundles", {
      method: "POST",
      body: JSON.stringify({ uiOps: [{ type: "token-override", token: "--b", value: "blue" }] }),
      headers: { "content-type": "application/json" },
    });
    const killed = await cp.app.request(`/v1/apps/app1/mods/${modId}/kill`, { method: "POST" });
    expect(killed.status).toBe(409);
  });

  it("subject overview returns pointer, full history with contents, and the subject's events", async () => {
    const { cp, modId } = await seededPlane();
    await cp.app.request("/v1/apps/app1/subjects/u1/bundles", {
      method: "POST",
      body: JSON.stringify({ uiOps: [{ type: "token-override", token: "--b", value: "blue" }] }),
      headers: { "content-type": "application/json" },
    });
    await cp.app.request("/v1/apps/app1/events", {
      method: "POST",
      body: JSON.stringify({ type: "mods_applied", subjectId: "u1" }),
    });
    await cp.app.request("/v1/apps/app1/events", {
      method: "POST",
      body: JSON.stringify({ type: "mods_applied", subjectId: "someone-else" }),
    });

    const overview = (await (await cp.app.request("/v1/apps/app1/subjects/u1/overview")).json()) as {
      subjectId: string;
      pointer: { status: string };
      mods: Array<{
        modId: string;
        status: string;
        contents: { uiOps: Array<{ token?: string }> } | null;
        envelope?: unknown;
      }>;
      events: Array<{ subjectId?: string }>;
    };
    expect(overview.subjectId).toBe("u1");
    expect(overview.pointer.status).toBe("active");
    expect(overview.mods).toHaveLength(2); // newest first, history included
    expect(overview.mods[0]!.status).toBe("active");
    expect(overview.mods[0]!.contents?.uiOps[0]?.token).toBe("--b");
    expect(overview.mods[1]!.modId).toBe(modId);
    expect(overview.mods[1]!.status).toBe("superseded");
    expect(overview.mods[0]!.envelope).toBeUndefined();
    expect(overview.events).toHaveLength(1); // only u1's events
  });

  it("restoring an active mod is rejected", async () => {
    const { cp, modId } = await seededPlane();
    const res = await cp.app.request(`/v1/apps/app1/mods/${modId}/restore`, { method: "POST" });
    expect(res.status).toBe(409);
  });
});
