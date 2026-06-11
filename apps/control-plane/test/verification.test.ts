import { describe, expect, it } from "vitest";
import { AppManifestSchema, ModBundleSchema, type ModBundle } from "@invariance/schema";
import { analyzeHookSource, verifyBundleAgainstManifest } from "../src/modules/verification";

const manifest = AppManifestSchema.parse({
  appId: "app1",
  version: "1.0.0",
  designTokens: [{ name: "--inv-accent", kind: "color", value: "#7c5cff" }],
  components: [
    {
      id: "card",
      name: "Card",
      slots: [
        { name: "badge", overridable: true },
        { name: "price", overridable: false },
      ],
    },
  ],
  endpoints: [
    { id: "list-items", method: "GET", path: "/api/items" },
    { id: "create-item", method: "POST", path: "/api/items" },
    { id: "delete-item", method: "DELETE", path: "/api/items/:id" },
  ],
  policies: [
    { type: "endpoint-deny", id: "no-delete", endpointId: "delete-item" },
    {
      type: "field-constraint",
      id: "titles-immutable",
      endpointId: "list-items",
      fieldPath: "items.*.title",
      constraint: { immutable: true },
    },
    { type: "budget-limit", id: "budgets", maxCpuMsPerHook: 100, maxMemMbPerHook: 64 },
  ],
  createdAt: "2026-06-10T00:00:00.000Z",
});

function bundle(partial: Partial<Parameters<typeof ModBundleSchema.parse>[0] & object>): ModBundle {
  return ModBundleSchema.parse({
    id: "mod_v",
    appId: "app1",
    subjectId: "u1",
    revision: 0,
    binding: { appManifestVersion: "1.0.0" },
    uiOps: [],
    hooks: [],
    createdAt: "2026-06-10T00:00:00.000Z",
    ...(partial as object),
  });
}

describe("verifyBundleAgainstManifest", () => {
  it("accepts a clean bundle", () => {
    const verdict = verifyBundleAgainstManifest(
      bundle({
        uiOps: [{ type: "token-override", token: "--inv-accent", value: "#ff4d8d" }],
        hooks: [
          {
            id: "h1",
            trigger: { endpointId: "list-items", phase: "response" },
            language: "js",
            source: "(payload) => payload",
          },
        ],
        capabilities: {
          reads: [{ endpointId: "list-items" }],
          writes: [{ endpointId: "list-items", fields: ["items.*.order"] }],
          budgets: { cpuMs: 50, memMb: 32 },
        },
      }),
      manifest,
    );
    expect(verdict).toEqual({ ok: true, reasons: [] });
  });

  it("rejects unknown tokens and stale bindings", () => {
    const verdict = verifyBundleAgainstManifest(
      bundle({
        binding: { appManifestVersion: "0.9.0" },
        uiOps: [{ type: "token-override", token: "--nope", value: "red" }],
      }),
      manifest,
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons.join()).toContain("unknown design token");
    expect(verdict.reasons.join()).toContain("bound to manifest 0.9.0");
  });

  it("rejects non-overridable and unknown slots, and unsafe content", () => {
    const verdict = verifyBundleAgainstManifest(
      bundle({
        uiOps: [
          { type: "slot-override", componentId: "card", slot: "price", content: "x" },
          { type: "slot-override", componentId: "card", slot: "ghost", content: "x" },
          {
            type: "slot-override",
            componentId: "card",
            slot: "badge",
            content: '<script>alert(1)</script>',
          },
        ],
      }),
      manifest,
    );
    expect(verdict.reasons).toHaveLength(3);
  });

  it("rejects unsafe css", () => {
    const verdict = verifyBundleAgainstManifest(
      bundle({
        uiOps: [
          {
            type: "style-rule",
            selector: ".card",
            declarations: { background: "url(https://evil.example/x.png)" },
          },
        ],
      }),
      manifest,
    );
    expect(verdict.reasons.join()).toContain("unsafe css declaration");
  });

  it("rejects hooks on denied endpoints", () => {
    const verdict = verifyBundleAgainstManifest(
      bundle({
        hooks: [
          {
            id: "h1",
            trigger: { endpointId: "delete-item", phase: "request" },
            language: "js",
            source: "(p) => p",
          },
        ],
        capabilities: { reads: [{ endpointId: "delete-item" }], writes: [], budgets: { cpuMs: 50, memMb: 32 } },
      }),
      manifest,
    );
    expect(verdict.reasons.join()).toContain("denied endpoint");
  });

  it("rejects write capabilities covering immutable fields, including whole-body writes", () => {
    const granular = verifyBundleAgainstManifest(
      bundle({
        capabilities: {
          reads: [],
          writes: [{ endpointId: "list-items", fields: ["items.*.title"] }],
          budgets: { cpuMs: 50, memMb: 32 },
        },
      }),
      manifest,
    );
    expect(granular.reasons.join()).toContain("immutable field");

    const wholeBody = verifyBundleAgainstManifest(
      bundle({
        capabilities: {
          reads: [],
          writes: [{ endpointId: "list-items" }],
          budgets: { cpuMs: 50, memMb: 32 },
        },
      }),
      manifest,
    );
    expect(wholeBody.reasons.join()).toContain("declare granular fields");
  });

  it("rejects budgets above the policy cap", () => {
    const verdict = verifyBundleAgainstManifest(
      bundle({
        capabilities: { reads: [], writes: [], budgets: { cpuMs: 500, memMb: 32 } },
      }),
      manifest,
    );
    expect(verdict.reasons.join()).toContain("exceeds policy max");
  });
});

describe("analyzeHookSource", () => {
  it("accepts a plain synchronous arrow function", () => {
    expect(analyzeHookSource("(payload) => ({ ...payload, x: 1 })")).toEqual([]);
    expect(analyzeHookSource("export default (p) => p")).toEqual([]);
  });

  it.each([
    ["eval('x')", "forbidden identifier: eval"],
    ["(p) => eval('x')", "forbidden identifier: eval"],
    ["(p) => fetch('https://x')", "forbidden identifier: fetch"],
    ["(p) => p.constructor", "forbidden member access: constructor"],
    ["(p) => p['__proto__']", "forbidden member access: __proto__"],
    ["import x from 'y'", "imports are not allowed"],
    ["async (p) => p", "must be plain synchronous"],
    ["(p) => { while(true){} }", null],
  ])("flags %s", (source, expected) => {
    const reasons = analyzeHookSource(source);
    if (expected === null) {
      expect(reasons).toEqual([]); // unbounded loops are the sandbox budget's job
    } else {
      expect(reasons.join()).toContain(expected);
    }
  });

  it("rejects multi-statement programs", () => {
    expect(analyzeHookSource("const a = 1; (p) => p").join()).toContain(
      "single function expression",
    );
  });

  it("rejects unparseable source", () => {
    expect(analyzeHookSource("(p) => {").join()).toContain("does not parse");
  });
});
