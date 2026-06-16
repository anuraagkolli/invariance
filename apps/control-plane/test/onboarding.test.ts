import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { OnboardingSession } from "@invariance/schema";
import { createControlPlane } from "../src/app";
import { buildPlan } from "../src/modules/onboarding";

// Repo root: apps/control-plane/test/ -> ../../.. = monorepo root.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const NEBULA = resolve(REPO_ROOT, "apps/nebula");

describe("onboarding scanner", () => {
  it("scans Nebula into archetypes, sections, tokens and endpoints", () => {
    const plan = buildPlan("nebula", NEBULA, { source: "path", ref: "apps/nebula" });

    // Next file-routes collapse into archetypes; the home route is "/".
    const keys = plan.archetypes.map((a) => a.key);
    expect(keys).toContain("/");
    expect(keys).toContain("/series");

    // Home delegates page -> <HomeScreen/> -> <Shell> and still segments.
    const home = plan.archetypes.find((a) => a.key === "/")!;
    expect(home.sections.length).toBeGreaterThan(0);
    expect(home.sections[0]!.domIndex).toBe(0);

    // Palette seeded from observed colors: full role-token map + salient swatches.
    expect(Object.keys(plan.roles)).toContain("--inv-accent");
    expect(plan.tokens.some((t) => t.salient && t.role === "--inv-accent")).toBe(true);

    // API endpoints are detected for the (read-only) logic plane.
    const endpoints = plan.endpoints.map((e) => `${e.method} ${e.path}`);
    expect(endpoints).toContain("GET /api/shows");
  });
});

describe("onboarding routes", () => {
  function cp() {
    return createControlPlane({ repoRoot: REPO_ROOT });
  }
  const json = (r: Response) => r.json() as Promise<OnboardingSession>;

  it("scans, patches and finalizes into a manifest + design-config", async () => {
    const { app, store } = cp();

    const scan = await app.fetch(
      new Request("http://x/v1/onboarding/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ appId: "nebula", path: "apps/nebula" }),
      }),
    );
    expect(scan.status).toBe(201);
    const session = await json(scan);
    expect(session.status).toBe("ready");
    const sid = session.sessionId;
    const sec = session.plan.archetypes.find((a) => a.sections.length > 0)!.sections[0]!;

    // Developer edits: rename + lock the section at level 0.
    const patched = await json(
      await app.fetch(
        new Request(`http://x/v1/onboarding/${sid}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sections: [{ id: sec.id, name: "billboard", level: 0 }] }),
        }),
      ),
    );
    const editedSection = patched.plan.archetypes
      .flatMap((a) => a.sections)
      .find((s) => s.id === sec.id)!;
    expect(editedSection.name).toBe("billboard");
    expect(editedSection.level).toBe(0);

    // Finalize publishes the manifest + design-config.
    const fin = await json(
      await app.fetch(new Request(`http://x/v1/onboarding/${sid}/finalize`, { method: "POST" })),
    );
    expect(fin.status).toBe("finalized");
    expect(fin.finalized?.manifestVersion).toBe("1.0.0");

    const manifest = await store.currentManifest("nebula");
    expect(manifest?.version).toBe("1.0.0");
    expect(manifest?.designSurface?.sections).toContain("billboard");
    expect(manifest?.designSurface?.pages.some((p) => p.route === "/")).toBe(true);
    expect(manifest!.endpoints.length).toBeGreaterThan(0);

    const dc = await store.getDesignConfig("nebula");
    expect(dc.lockedSections).toContain("billboard");
  });

  it("404s an unknown session", async () => {
    const { app } = cp();
    const r = await app.fetch(new Request("http://x/v1/onboarding/nope"));
    expect(r.status).toBe(404);
  });
});
