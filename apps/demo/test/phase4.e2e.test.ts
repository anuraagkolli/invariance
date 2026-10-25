// @vitest-environment node
import { submitPrompt } from "@invariance/client";
import { MockAgent } from "@invariance/control-plane";
import { createInvarianceMiddleware } from "@invariance/server";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDemoServer, SHOWS } from "../server/app";
import { publishDemoManifest, startControlPlane, type TestControlPlane } from "./helpers";

/**
 * Phase 4 exit criteria: a prompt rewires a demo workflow at the API seam —
 * a verified hook visibly reorders what the demo API returns, while the
 * middleware's capability + policy enforcement keeps hostile-but-signed
 * output from ever reaching the user.
 */

const sortByRatingDraft = {
  hooks: [
    {
      id: "hook_sort_rating",
      trigger: { endpointId: "list-shows", phase: "response" },
      language: "js",
      source:
        "(payload) => ({ ...payload, shows: [...payload.shows].sort((a, b) => b.rating - a.rating) })",
    },
  ],
  capabilities: {
    reads: [{ endpointId: "list-shows" }],
    writes: [{ endpointId: "list-shows", fields: ["shows"] }],
    budgets: { cpuMs: 50, memMb: 32 },
  },
};

// Statically signable (declared writes are an allowed ancestor of the
// immutable field) — only the runtime policy check can stop it.
const retitleDraft = {
  hooks: [
    {
      id: "hook_retitle",
      trigger: { endpointId: "list-shows", phase: "response" },
      language: "js",
      source:
        "(payload) => ({ ...payload, shows: payload.shows.map((s) => ({ ...s, title: 'OWNED' })) })",
    },
  ],
  capabilities: {
    reads: [{ endpointId: "list-shows" }],
    writes: [{ endpointId: "list-shows", fields: ["shows"] }],
    budgets: { cpuMs: 50, memMb: 32 },
  },
};

const maxPriorityDraft = {
  hooks: [
    {
      id: "hook_max_priority",
      trigger: { endpointId: "add-watchlist", phase: "request" },
      language: "js",
      source: "(payload) => ({ ...payload, priority: 5 })",
    },
  ],
  capabilities: {
    reads: [{ endpointId: "add-watchlist" }],
    writes: [{ endpointId: "add-watchlist", fields: ["priority"] }],
    budgets: { cpuMs: 50, memMb: 32 },
  },
};

let cp: TestControlPlane;
let api: Server;
let apiUrl: string;

beforeAll(async () => {
  cp = await startControlPlane({
    agent: new MockAgent([sortByRatingDraft, retitleDraft, maxPriorityDraft]),
  });
  await publishDemoManifest(cp.url);

  const app = createDemoServer({
    middleware: createInvarianceMiddleware({
      registryUrl: cp.url,
      appId: "streamline",
      getSubject: (req) => req.header("x-demo-user") ?? undefined,
      pointerTtlMs: 0,
    }),
  });
  api = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  apiUrl = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => api.close(resolve));
  await cp.close();
});

const getShows = async (user: string) => {
  const res = await fetch(`${apiUrl}/api/shows`, { headers: { "x-demo-user": user } });
  return ((await res.json()) as { shows: typeof SHOWS }).shows;
};

describe("phase 4 exit criteria: a prompt rewires the API seam", () => {
  it("prompt -> hook mod -> the demo API visibly reorders, under enforcement", async () => {
    const config = { registryUrl: cp.url, appId: "streamline", subjectId: "sorter" };
    const result = await submitPrompt(config, "sort shows by rating, best first");
    expect(result.ok).toBe(true);

    const shows = await getShows("sorter");
    const ratings = shows.map((s) => s.rating);
    expect(ratings).toEqual([...ratings].sort((a, b) => b - a));
    expect(ratings).not.toEqual(SHOWS.map((s) => s.rating)); // actually reordered
    // Nothing was lost or rewritten in transit.
    expect(new Set(shows.map((s) => s.title))).toEqual(new Set(SHOWS.map((s) => s.title)));
  });

  it("other users keep base order", async () => {
    const shows = await getShows("bystander");
    expect(shows.map((s) => s.id)).toEqual(SHOWS.map((s) => s.id));
  });

  it("a signed mod that rewrites immutable titles is neutralized at the seam", async () => {
    const config = { registryUrl: cp.url, appId: "streamline", subjectId: "vandal" };
    const result = await submitPrompt(config, "rename every show to OWNED");
    expect(result.ok).toBe(true); // signable: ancestor writes are legal to declare

    const shows = await getShows("vandal");
    expect(shows.map((s) => s.title)).toEqual(SHOWS.map((s) => s.title)); // rolled back
  });

  it("a request-phase hook transforms what the user submits", async () => {
    const config = { registryUrl: cp.url, appId: "streamline", subjectId: "lister" };
    const result = await submitPrompt(config, "always add shows to my list at top priority");
    expect(result.ok).toBe(true);

    const res = await fetch(`${apiUrl}/api/watchlist`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-demo-user": "lister" },
      body: JSON.stringify({ showId: "s1", priority: 2 }),
    });
    expect(res.status).toBe(201);
    const { item } = (await res.json()) as { item: { priority: number } };
    expect(item.priority).toBe(5);
  });
});
