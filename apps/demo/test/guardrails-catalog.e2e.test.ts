// @vitest-environment node
import { createInvarianceMiddleware } from "@invariance/server";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDemoServer } from "../server/app";
import { GUARDRAIL_TESTS } from "../../console/src/guardrails";
import { publishDemoManifest, startControlPlane, type TestControlPlane } from "./helpers";

let cp: TestControlPlane;
let api: Server;
let apiUrl: string;

beforeAll(async () => {
  cp = await startControlPlane();
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

describe("guardrails catalog stays honest against the live manifest", () => {
  it("every catalog entry exists and is well-formed", () => {
    expect(GUARDRAIL_TESTS.length).toBeGreaterThanOrEqual(8);
    for (const t of GUARDRAIL_TESTS) {
      expect(t.id).toBeTruthy();
      if (t.layer === "runtime") expect(t.runtime).toBeTruthy();
      else expect(t.expect?.contains).toBeTruthy();
    }
  });

  for (const t of GUARDRAIL_TESTS) {
    it(`[${t.layer}] ${t.id} → invariant holds`, async () => {
      const sid = `__guardrail_${t.id}`;
      const reg = await fetch(`${cp.url}/v1/apps/streamline/subjects/${sid}/bundles`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(t.draft),
      });

      if (t.layer === "authoring") {
        expect(reg.status).toBe(422);
        const body = (await reg.json()) as { reasons: string[] };
        expect(body.reasons.join(" | ")).toContain(t.expect!.contains);
        return;
      }

      // runtime: the cheat passes verification + signing...
      expect(reg.status).toBe(201);
      // ...then the demo runtime neutralizes it at execution.
      const r = t.runtime!;
      const res = await fetch(`${apiUrl}${r.path}`, {
        method: r.method ?? "GET",
        headers: { "content-type": "application/json", "x-demo-user": sid },
        ...(r.body !== undefined ? { body: JSON.stringify(r.body) } : {}),
      });
      const json = await res.json();
      expect(r.check(json)).toBe(true); // invariant held (canonical data)

      // ...and the block is recorded as developer-visible telemetry.
      const ov = (await (
        await fetch(`${cp.url}/v1/apps/streamline/subjects/${sid}/overview`)
      ).json()) as { events: Array<{ type: string }> };
      expect(ov.events.some((e) => e.type === "hook_policy_violation")).toBe(true);
    });
  }
});
