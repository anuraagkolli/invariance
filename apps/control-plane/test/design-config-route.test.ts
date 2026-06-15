import { describe, expect, it } from "vitest";
import { createControlPlane } from "../src/app";

describe("design-config route", () => {
  it("defaults to {} then round-trips a PUT", async () => {
    const cp = createControlPlane();
    const r0 = await cp.app.fetch(new Request("http://x/v1/apps/nebula/design-config"));
    expect(r0.status).toBe(200);
    expect(await r0.json()).toEqual({});

    const put = await cp.app.fetch(
      new Request("http://x/v1/apps/nebula/design-config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accentLock: "#e94560", contrastFloor: 7 }),
      }),
    );
    expect(put.status).toBe(200);

    const r1 = await cp.app.fetch(new Request("http://x/v1/apps/nebula/design-config"));
    expect(await r1.json()).toEqual({ accentLock: "#e94560", contrastFloor: 7 });
  });

  it("rejects an invalid config (400)", async () => {
    const cp = createControlPlane();
    const put = await cp.app.fetch(
      new Request("http://x/v1/apps/nebula/design-config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chromaCap: 5 }),
      }),
    );
    expect(put.status).toBe(400);
  });
});
