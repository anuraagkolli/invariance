import { describe, expect, it } from "vitest";
import { createControlPlane } from "../src/app";

describe("themes routes", () => {
  const BASE = "http://x/v1/apps/nebula/themes";
  const V1_THEME = { version: 1, theme: { roles: { "--x": "#000" } } };
  const V2_THEME = { version: 2, theme: { roles: { "--x": "#fff" } } };

  // ── Round trip ──────────────────────────────────────────────────────────────

  it("GET /themes before any PUT returns null (the design plane's first-load boundary)", async () => {
    const cp = createControlPlane();
    const res = await cp.app.fetch(new Request(`${BASE}?userId=u1`));
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });

  it("PUT returns {ok:true, seq:1} and GET /themes?userId=u1 returns the saved theme", async () => {
    const cp = createControlPlane();

    const put1 = await cp.app.fetch(
      new Request(BASE, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        // `appId` in the body is redundant — the route reads it from the path
        // and zod strips it. Sent here on purpose: it mirrors what the design
        // plane's createApiStorage.saveTheme actually puts on the wire.
        body: JSON.stringify({ userId: "u1", appId: "nebula", theme: V1_THEME }),
      }),
    );
    expect(put1.status).toBe(200);
    expect(await put1.json()).toEqual({ ok: true, seq: 1 });

    const get1 = await cp.app.fetch(new Request(`${BASE}?userId=u1`));
    expect(get1.status).toBe(200);
    expect(await get1.json()).toEqual(V1_THEME);
  });

  it("second PUT advances seq to 2 and GET returns latest theme", async () => {
    const cp = createControlPlane();

    await cp.app.fetch(
      new Request(BASE, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: "u1", appId: "nebula", theme: V1_THEME }),
      }),
    );

    const put2 = await cp.app.fetch(
      new Request(BASE, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: "u1", appId: "nebula", theme: V2_THEME }),
      }),
    );
    expect(put2.status).toBe(200);
    expect(await put2.json()).toEqual({ ok: true, seq: 2 });

    const get = await cp.app.fetch(new Request(`${BASE}?userId=u1`));
    expect(get.status).toBe(200);
    expect(await get.json()).toEqual(V2_THEME);
  });

  // ── History ─────────────────────────────────────────────────────────────────

  it("GET /themes/history?userId=u1 returns entries newest-first", async () => {
    const cp = createControlPlane();

    await cp.app.fetch(
      new Request(BASE, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: "u1", theme: V1_THEME }),
      }),
    );
    await cp.app.fetch(
      new Request(BASE, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: "u1", theme: V2_THEME }),
      }),
    );

    const res = await cp.app.fetch(new Request(`${BASE}/history?userId=u1`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { entries: Array<{ seq: number }> };
    expect(body).toHaveProperty("entries");
    expect(body.entries).toHaveLength(2);
    // newest-first: seq 2 then seq 1
    expect(body.entries[0]!.seq).toBe(2);
    expect(body.entries[1]!.seq).toBe(1);
  });

  it("GET /themes/history (no userId) returns timelines", async () => {
    const cp = createControlPlane();

    await cp.app.fetch(
      new Request(BASE, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: "u1", theme: V1_THEME }),
      }),
    );
    await cp.app.fetch(
      new Request(BASE, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: "u1", theme: V2_THEME }),
      }),
    );

    const res = await cp.app.fetch(new Request(`${BASE}/history`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      timelines: Array<{ userId: string; count: number; latestAt: string }>;
    };
    expect(body).toHaveProperty("timelines");
    expect(body.timelines).toHaveLength(1);
    expect(body.timelines[0]!.userId).toBe("u1");
    expect(body.timelines[0]!.count).toBe(2);
    expect(typeof body.timelines[0]!.latestAt).toBe("string");
  });

  // ── Rollback ─────────────────────────────────────────────────────────────────

  it("POST /themes/rollback appends v1 as seq:3 and GET returns v1 theme", async () => {
    const cp = createControlPlane();

    // Save v1 and v2
    await cp.app.fetch(
      new Request(BASE, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: "u1", theme: V1_THEME }),
      }),
    );
    await cp.app.fetch(
      new Request(BASE, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: "u1", theme: V2_THEME }),
      }),
    );

    // Rollback to seq:1
    const rollback = await cp.app.fetch(
      new Request(`${BASE}/rollback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: "u1", seq: 1 }),
      }),
    );
    expect(rollback.status).toBe(200);
    expect(await rollback.json()).toEqual({ ok: true, seq: 3 });

    // GET latest is now v1
    const get = await cp.app.fetch(new Request(`${BASE}?userId=u1`));
    expect(get.status).toBe(200);
    expect(await get.json()).toEqual(V1_THEME);

    // History newest entry has rollback meta
    const history = await cp.app.fetch(new Request(`${BASE}/history?userId=u1`));
    const { entries } = (await history.json()) as {
      entries: Array<{ seq: number; meta?: { source?: string; description?: string } }>;
    };
    expect(entries[0]!.seq).toBe(3);
    expect(entries[0]!.meta?.source).toBe("rollback");
    expect(entries[0]!.meta?.description).toBe("Rollback to v1");
  });

  // ── Edge cases ───────────────────────────────────────────────────────────────

  it("GET /themes without userId returns 400", async () => {
    const cp = createControlPlane();
    const res = await cp.app.fetch(new Request(BASE));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "userId required" });
  });

  it("POST /themes/rollback with unknown seq returns 404", async () => {
    const cp = createControlPlane();
    const res = await cp.app.fetch(
      new Request(`${BASE}/rollback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: "u1", seq: 99 }),
      }),
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/99/);
  });

  it("PUT /themes with missing userId returns 400 (zod)", async () => {
    const cp = createControlPlane();
    const res = await cp.app.fetch(
      new Request(BASE, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ theme: V1_THEME }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("PUT /themes with non-object theme returns 400 (zod)", async () => {
    const cp = createControlPlane();
    const res = await cp.app.fetch(
      new Request(BASE, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: "u1", theme: "not-an-object" }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
