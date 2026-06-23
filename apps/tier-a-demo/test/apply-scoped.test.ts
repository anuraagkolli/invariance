// @vitest-environment happy-dom
import { compile, parseSpec } from "@invariance/theming";
import { describe, expect, it } from "vitest";
import { DEMO_MANIFEST } from "../src/demo/manifest.js";
import { applyScoped } from "../src/preview/apply-scoped.js";

function sampleTheme() {
  const p = parseSpec({ colors: { primary: "oklch(0.35 0.12 270)" } }, DEMO_MANIFEST);
  if (!p.ok) throw new Error(`setup: ${JSON.stringify(p.failures)}`);
  return compile(p.spec, DEMO_MANIFEST);
}

describe("applyScoped (logic)", () => {
  it("sets the light var map on the wrapper, no .dark class", () => {
    const t = sampleTheme();
    const el = document.createElement("div");
    applyScoped(el, t, "light");
    expect(el.style.getPropertyValue("--primary")).toBe(t.light["--primary"]);
    expect(el.classList.contains("dark")).toBe(false);
  });

  it("sets the dark var map AND the .dark class on the wrapper", () => {
    const t = sampleTheme();
    expect(t.dark, "demo manifest is two-mode — dark must be emitted").toBeDefined();
    const el = document.createElement("div");
    applyScoped(el, t, "dark");
    expect(el.style.getPropertyValue("--primary")).toBe(t.dark!["--primary"]);
    expect(el.classList.contains("dark")).toBe(true);
  });
});
