import { describe, expect, it } from "vitest";
import { generateSigningKeyPair } from "@invariance/schema/signing";
import { createControlPlane } from "../src/app";
import { MockAgent } from "../src/modules/authoring/mock";
import { authorMod } from "../src/modules/authoring/pipeline";
import { publishManifest } from "../src/modules/registry";
import { MemoryStore } from "../src/store";

const keys = generateSigningKeyPair();

const manifest = {
  appId: "app1",
  version: "1.0.0",
  designTokens: [{ name: "--inv-accent", kind: "color", value: "#7c5cff" }],
  components: [],
  endpoints: [{ id: "list-items", method: "GET", path: "/api/items" }],
  policies: [],
  createdAt: "2026-06-10T00:00:00.000Z",
};

const goodDraft = {
  uiOps: [{ type: "token-override", token: "--inv-accent", value: "teal" }],
};
const badDraft = {
  uiOps: [{ type: "token-override", token: "--invented-token", value: "teal" }],
};

describe("authorMod pipeline", () => {
  it("publishes a verified draft on the first attempt", async () => {
    const store = new MemoryStore();
    publishManifest(store, "app1", manifest);
    const agent = new MockAgent([goodDraft]);
    const result = await authorMod({
      store, keys, agent, appId: "app1", subjectId: "u1", prompt: "make the accent teal",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.attempts).toBe(1);
      expect(result.record.prompts).toEqual(["make the accent teal"]);
    }
  });

  it("feeds verifier reasons back to the agent and repairs", async () => {
    const store = new MemoryStore();
    publishManifest(store, "app1", manifest);
    const agent = new MockAgent([badDraft, goodDraft]);
    const result = await authorMod({
      store, keys, agent, appId: "app1", subjectId: "u1", prompt: "teal please",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.attempts).toBe(2);
    expect(agent.inputs[1]?.feedback.join()).toContain("unknown design token");
  });

  it("gives up after maxAttempts and records a rejection event", async () => {
    const store = new MemoryStore();
    publishManifest(store, "app1", manifest);
    const agent = new MockAgent([badDraft]);
    const result = await authorMod({
      store, keys, agent, appId: "app1", subjectId: "u1", prompt: "x", maxAttempts: 2,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.join()).toContain("unknown design token");
    expect(store.app("app1").events.some((e) => e.type === "mod_rejected")).toBe(true);
  });

  it("passes the current modset so prompts accumulate cumulatively", async () => {
    const store = new MemoryStore();
    publishManifest(store, "app1", manifest);
    const agent = new MockAgent([goodDraft, goodDraft]);
    await authorMod({ store, keys, agent, appId: "app1", subjectId: "u1", prompt: "first" });
    const second = await authorMod({
      store, keys, agent, appId: "app1", subjectId: "u1", prompt: "second",
    });
    expect(agent.inputs[1]?.currentBundle?.uiOps).toHaveLength(1);
    if (second.ok) expect(second.record.prompts).toEqual(["first", "second"]);
  });
});

describe("prompts route", () => {
  it("authoring via HTTP: prompt -> active pointer", async () => {
    const { app } = createControlPlane({ keys, agent: new MockAgent([goodDraft]) });
    await app.request("/v1/apps/app1/manifest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(manifest),
    });
    const res = await app.request("/v1/apps/app1/subjects/u1/prompts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "make the accent teal" }),
    });
    expect(res.status).toBe(201);
    const pointer = (await (
      await app.request("/v1/apps/app1/subjects/u1/pointer")
    ).json()) as { status: string };
    expect(pointer.status).toBe("active");
  });

  it("returns 422 with reasons when verification cannot be satisfied", async () => {
    const { app } = createControlPlane({ keys, agent: new MockAgent([badDraft]) });
    await app.request("/v1/apps/app1/manifest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(manifest),
    });
    const res = await app.request("/v1/apps/app1/subjects/u1/prompts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "x" }),
    });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { reasons: string[] }).reasons.join()).toContain(
      "unknown design token",
    );
  });

  it("returns 503 when no agent is configured", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { app } = createControlPlane({ keys });
    const res = await app.request("/v1/apps/app1/subjects/u1/prompts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "x" }),
    });
    expect(res.status).toBe(503);
  });
});
