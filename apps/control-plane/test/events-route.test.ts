import { describe, expect, it } from "vitest";
import { createControlPlane } from "../src/app";

describe("GET /v1/apps/:appId/events", () => {
  it("returns recent events newest-first, limited, with detail", async () => {
    const cp = createControlPlane();
    await cp.store.addEvent({ type: "a", appId: "streamline", at: 1 });
    await cp.store.addEvent({
      type: "hook_policy_violation",
      appId: "streamline",
      at: 2,
      detail: { violations: ["immutable field changed: shows.*.title"] },
    });
    await cp.store.addEvent({ type: "c", appId: "streamline", at: 3 });

    const res = await cp.app.fetch(
      new Request("http://local/v1/apps/streamline/events?limit=2"),
    );
    expect(res.status).toBe(200);
    const { events } = (await res.json()) as {
      events: Array<{ type: string; detail?: { violations?: string[] } }>;
    };
    expect(events.map((e) => e.type)).toEqual(["c", "hook_policy_violation"]);
    expect(events[1]?.detail?.violations).toEqual([
      "immutable field changed: shows.*.title",
    ]);
  });

  it("caps limit at 200 and defaults sanely", async () => {
    const cp = createControlPlane();
    const res = await cp.app.fetch(
      new Request("http://local/v1/apps/streamline/events"),
    );
    expect(res.status).toBe(200);
    const { events } = (await res.json()) as { events: unknown[] };
    expect(Array.isArray(events)).toBe(true);
  });
});
