import { beforeEach, describe, expect, it } from "vitest";
import { ModBundleSchema, type ModBundle } from "@invariance/schema";
import { applyOverlay, clearOverlay, slotKey } from "../src/core/overlay";

function bundleWith(uiOps: unknown[]): ModBundle {
  return ModBundleSchema.parse({
    id: "mod_test",
    appId: "demo",
    subjectId: "u1",
    revision: 0,
    binding: { appManifestVersion: "1.0.0" },
    uiOps,
    hooks: [],
    createdAt: "2026-06-10T00:00:00.000Z",
  });
}

beforeEach(() => {
  clearOverlay();
});

describe("applyOverlay", () => {
  it("applies token overrides as :root custom properties", () => {
    applyOverlay(bundleWith([{ type: "token-override", token: "--inv-accent", value: "#ff4d8d" }]));
    expect(document.documentElement.style.getPropertyValue("--inv-accent")).toBe("#ff4d8d");
  });

  it("emits style rules scoped under the scope attribute", () => {
    applyOverlay(
      bundleWith([
        {
          type: "style-rule",
          selector: ".show-card, .hero",
          declarations: { border: "1px solid red" },
        },
      ]),
      "data-test-root",
    );
    const styleEl = document.getElementById("invariance-overlay-styles");
    expect(styleEl?.textContent).toContain("[data-test-root] .show-card");
    expect(styleEl?.textContent).toContain("[data-test-root] .hero");
    expect(styleEl?.textContent).toContain("border: 1px solid red;");
  });

  it("strips CSS-breaking characters from values", () => {
    applyOverlay(
      bundleWith([
        {
          type: "style-rule",
          selector: ".x",
          declarations: { color: "red; } body { display: none" },
        },
      ]),
    );
    const styleEl = document.getElementById("invariance-overlay-styles");
    expect(styleEl?.textContent).not.toContain("display: none }");
    expect(styleEl?.textContent).toContain("color: red  body  display: none;");
  });

  it("returns slot overrides keyed by component and slot", () => {
    const applied = applyOverlay(
      bundleWith([
        { type: "slot-override", componentId: "show-card", slot: "badge", content: "<b>hi</b>" },
      ]),
    );
    expect(applied.slotOverrides.get(slotKey("show-card", "badge"))).toBe("<b>hi</b>");
  });

  it("re-applying replaces the previous overlay; clear removes everything", () => {
    applyOverlay(bundleWith([{ type: "token-override", token: "--inv-a", value: "1px" }]));
    applyOverlay(bundleWith([{ type: "token-override", token: "--inv-b", value: "2px" }]));
    expect(document.documentElement.style.getPropertyValue("--inv-a")).toBe("");
    expect(document.documentElement.style.getPropertyValue("--inv-b")).toBe("2px");
    clearOverlay();
    expect(document.documentElement.style.getPropertyValue("--inv-b")).toBe("");
    expect(document.getElementById("invariance-overlay-styles")).toBeNull();
  });
});
