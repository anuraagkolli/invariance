import { describe, it, expect } from "vitest";
import { createControlPlane } from "../src/app";

describe("PUT/GET /design-config carries variableRoleMap", () => {
  it("round-trips the variable→role map", async () => {
    const { app } = createControlPlane();
    const body = {
      variableRoleMap: { "--primary": { role: "accent", scope: ":root", locked: true } },
      allowedModes: ["light"],
    };
    const put = await app.request("/v1/apps/acme/design-config", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(put.status).toBe(200);

    const get = await app.request("/v1/apps/acme/design-config");
    const got = await get.json();
    expect(got.variableRoleMap["--primary"]).toEqual({
      role: "accent", scope: ":root", locked: true,
    });
    expect(got.allowedModes).toEqual(["light"]);
  });
});
