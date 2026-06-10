import { describe, expect, it } from "vitest";
import { AppManifestSchema } from "../src/manifest";

function baseManifest() {
  return {
    appId: "demo",
    version: "1.0.0",
    designTokens: [{ name: "--inv-primary", kind: "color" as const, value: "#1a1a2e" }],
    components: [
      {
        id: "sidebar",
        name: "Sidebar",
        slots: [{ name: "header", overridable: true }],
      },
    ],
    endpoints: [
      { id: "list-items", method: "GET" as const, path: "/api/items" },
      { id: "create-item", method: "POST" as const, path: "/api/items" },
    ],
    policies: [
      {
        type: "field-constraint" as const,
        id: "discount-cap",
        endpointId: "create-item",
        fieldPath: "item.discountPct",
        constraint: { max: 20 },
      },
    ],
    createdAt: "2026-06-10T00:00:00.000Z",
  };
}

describe("AppManifestSchema", () => {
  it("parses a valid manifest and applies defaults", () => {
    const manifest = AppManifestSchema.parse(baseManifest());
    expect(manifest.appId).toBe("demo");
    expect(manifest.components[0]?.slots[0]?.overridable).toBe(true);
  });

  it("rejects a non-semver version", () => {
    const result = AppManifestSchema.safeParse({ ...baseManifest(), version: "1.0" });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate endpoint ids", () => {
    const input = baseManifest();
    input.endpoints.push({ id: "list-items", method: "POST", path: "/api/other" });
    const result = AppManifestSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.success ? "" : result.error.message).toContain("duplicate endpoint id");
  });

  it("rejects duplicate component ids", () => {
    const input = baseManifest();
    input.components.push({ id: "sidebar", name: "Sidebar 2", slots: [] });
    const result = AppManifestSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.success ? "" : result.error.message).toContain("duplicate component id");
  });

  it("rejects a policy referencing an unknown endpoint", () => {
    const input = baseManifest();
    input.policies.push({
      type: "field-constraint",
      id: "bad-ref",
      endpointId: "no-such-endpoint",
      fieldPath: "x",
      constraint: { max: 1 },
    });
    const result = AppManifestSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.success ? "" : result.error.message).toContain("unknown endpoint");
  });

  it("defaults endpoint-deny phases to both phases", () => {
    const input = baseManifest();
    input.policies = [
      { type: "endpoint-deny", id: "no-create", endpointId: "create-item" } as never,
    ];
    const manifest = AppManifestSchema.parse(input);
    const policy = manifest.policies[0];
    expect(policy?.type).toBe("endpoint-deny");
    if (policy?.type === "endpoint-deny") {
      expect(policy.phases).toEqual(["request", "response"]);
    }
  });
});
