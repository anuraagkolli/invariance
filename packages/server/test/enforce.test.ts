import { AppManifestSchema, type CapabilityManifest } from "@invariance/schema";
import { describe, expect, it } from "vitest";
import { checkCapabilityWrites, checkFieldConstraints } from "../src/enforce";

const capabilities = (writes: CapabilityManifest["writes"]): CapabilityManifest => ({
  reads: [],
  writes,
  budgets: { cpuMs: 50, memMb: 32 },
});

describe("checkCapabilityWrites", () => {
  it("passes when nothing changed", () => {
    expect(checkCapabilityWrites({ a: 1 }, { a: 1 }, capabilities([]), "ep")).toEqual([]);
  });

  it("flags undeclared writes with the concrete path", () => {
    const violations = checkCapabilityWrites(
      { a: 1, b: 2 },
      { a: 1, b: 3 },
      capabilities([{ endpointId: "ep", fields: ["a"] }]),
      "ep",
    );
    expect(violations).toEqual(["undeclared write to b"]);
  });

  it("wildcard field declarations cover array element writes", () => {
    const original = { items: [{ note: "x" }, { note: "y" }] };
    const transformed = { items: [{ note: "X" }, { note: "Y" }] };
    expect(
      checkCapabilityWrites(
        original,
        transformed,
        capabilities([{ endpointId: "ep", fields: ["items.*.note"] }]),
        "ep",
      ),
    ).toEqual([]);
  });

  it("a prefix declaration covers the whole subtree (reorders included)", () => {
    const original = { items: [1, 2, 3] };
    const transformed = { items: [3, 2, 1] };
    expect(
      checkCapabilityWrites(
        original,
        transformed,
        capabilities([{ endpointId: "ep", fields: ["items"] }]),
        "ep",
      ),
    ).toEqual([]);
  });

  it("a writes entry without fields covers the whole body", () => {
    expect(
      checkCapabilityWrites({ a: 1 }, { z: 9 }, capabilities([{ endpointId: "ep" }]), "ep"),
    ).toEqual([]);
  });

  it("declarations for other endpoints do not apply", () => {
    const violations = checkCapabilityWrites(
      { a: 1 },
      { a: 2 },
      capabilities([{ endpointId: "other", fields: ["a"] }]),
      "ep",
    );
    expect(violations).toEqual(["undeclared write to a"]);
  });
});

describe("checkFieldConstraints", () => {
  const manifest = AppManifestSchema.parse({
    appId: "test",
    version: "1.0.0",
    endpoints: [{ id: "ep", method: "POST", path: "/api/x" }],
    policies: [
      {
        type: "field-constraint",
        id: "range",
        endpointId: "ep",
        fieldPath: "priority",
        constraint: { min: 1, max: 5 },
      },
      {
        type: "field-constraint",
        id: "locked",
        endpointId: "ep",
        fieldPath: "items.*.title",
        constraint: { immutable: true },
      },
    ],
    createdAt: new Date().toISOString(),
  });

  it("passes a compliant transform", () => {
    const original = { priority: 2, items: [{ title: "A" }] };
    const transformed = { priority: 5, items: [{ title: "A" }] };
    expect(checkFieldConstraints(manifest, "ep", original, transformed)).toEqual([]);
  });

  it("flags range violations on the transformed payload", () => {
    const violations = checkFieldConstraints(manifest, "ep", { priority: 2 }, { priority: 99 });
    expect(violations.join()).toContain("above max");
  });

  it("flags immutable fields that changed, matched through wildcards", () => {
    const original = { items: [{ title: "A" }, { title: "B" }] };
    const transformed = { items: [{ title: "A" }, { title: "Z" }] };
    const violations = checkFieldConstraints(manifest, "ep", original, transformed);
    expect(violations.join()).toContain("immutable field changed: items.*.title");
  });

  it("permits reordering items whose immutable fields are intact", () => {
    const original = { priority: 1, items: [{ title: "A" }, { title: "B" }] };
    const transformed = { priority: 1, items: [{ title: "B" }, { title: "A" }] };
    expect(checkFieldConstraints(manifest, "ep", original, transformed)).toEqual([]);
  });

  it("flags removed (hidden) immutable values, not just rewrites", () => {
    const original = { items: [{ title: "A" }, { title: "B" }] };
    const transformed = { items: [{ title: "A" }] };
    const violations = checkFieldConstraints(manifest, "ep", original, transformed);
    expect(violations.join()).toContain("immutable field changed");
  });

  it("policies for other endpoints do not apply", () => {
    expect(checkFieldConstraints(manifest, "other", { priority: 0 }, { priority: 99 })).toEqual([]);
  });
});
