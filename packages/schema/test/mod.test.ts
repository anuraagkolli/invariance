import { describe, expect, it } from "vitest";
import { ModBundleSchema } from "../src/mod";

export function baseBundle() {
  return {
    id: "mod_01",
    appId: "demo",
    subjectId: "user_42",
    revision: 3,
    binding: { appManifestVersion: "1.0.0" },
    uiOps: [
      { type: "token-override" as const, token: "--inv-primary", value: "#1b2a4a" },
      {
        type: "style-rule" as const,
        selector: ".sidebar",
        declarations: { "border-radius": "8px" },
      },
    ],
    hooks: [
      {
        id: "hook_sort",
        trigger: { endpointId: "list-items", phase: "response" as const },
        language: "js" as const,
        source: "export default (res) => ({ ...res, items: res.items.reverse() });",
      },
    ],
    capabilities: {
      reads: [{ endpointId: "list-items" }],
      writes: [],
      budgets: { cpuMs: 50, memMb: 32 },
    },
    createdAt: "2026-06-10T00:00:00.000Z",
  };
}

describe("ModBundleSchema", () => {
  it("parses a valid bundle", () => {
    const bundle = ModBundleSchema.parse(baseBundle());
    expect(bundle.hooks).toHaveLength(1);
    expect(bundle.uiOps).toHaveLength(2);
  });

  it("applies capability defaults for a UI-only bundle", () => {
    const input = { ...baseBundle(), hooks: [] };
    delete (input as Record<string, unknown>).capabilities;
    const bundle = ModBundleSchema.parse(input);
    expect(bundle.capabilities.reads).toEqual([]);
    expect(bundle.capabilities.budgets).toEqual({ cpuMs: 50, memMb: 32 });
  });

  it("rejects a hook targeting an endpoint not declared in capabilities", () => {
    const input = baseBundle();
    input.capabilities.reads = [];
    const result = ModBundleSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.success ? "" : result.error.message).toContain("not declared in capabilities");
  });

  it("rejects an unknown ui op type", () => {
    const input = baseBundle();
    input.uiOps.push({ type: "script-inject", src: "https://evil.example" } as never);
    expect(ModBundleSchema.safeParse(input).success).toBe(false);
  });

  it("rejects a hook with empty source", () => {
    const input = baseBundle();
    input.hooks[0]!.source = "";
    expect(ModBundleSchema.safeParse(input).success).toBe(false);
  });

  it("rejects a style-rule with no declarations", () => {
    const input = baseBundle();
    input.uiOps[1] = { type: "style-rule", selector: ".x", declarations: {} } as never;
    expect(ModBundleSchema.safeParse(input).success).toBe(false);
  });

  it("rejects budgets above hard caps", () => {
    const input = baseBundle();
    input.capabilities.budgets = { cpuMs: 5000, memMb: 32 };
    expect(ModBundleSchema.safeParse(input).success).toBe(false);
  });
});
