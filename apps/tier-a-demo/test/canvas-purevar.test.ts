import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("canvas is pure-var (no dark: utilities → one source of truth)", () => {
  const src = readFileSync(fileURLToPath(new URL("../src/canvas/AnalyticsDashboard.tsx", import.meta.url)), "utf8");

  it("AnalyticsDashboard.tsx contains no `dark:` Tailwind utility", () => {
    // a `dark:` utility would activate off the .dark class as a SECOND source of truth beside the vars
    expect(/(^|[\s"'`])dark:/.test(src), "found a dark: utility — the canvas must theme only via hsl(var(--x))").toBe(false);
  });

  it("no raw numeric spacing Tailwind classes (p-N/px-N/py-N/gap-N) remain", () => {
    // spacing must flow through sp() / var(--space-*), not raw Tailwind numeric utilities
    expect(/\b(p|px|py|gap)-[1-9]/.test(src), "found raw numeric spacing class — use sp() / var(--space-*)").toBe(false);
  });

  it("source references var(--space-, var(--font-body), and the SHADOWS/BORDERS/SIZES maps", () => {
    expect(src, "must reference var(--space- tokens").toContain("var(--space-");
    expect(src, "must reference var(--font-body)").toContain("var(--font-body)");
    expect(src, "must define the SHADOWS map").toContain("SHADOWS");
    expect(src, "must define the BORDERS map").toContain("BORDERS");
    expect(src, "must define the SIZES map").toContain("SIZES");
  });

  it("no literal boxShadow string outside the SHADOWS map definition", () => {
    // strip the SHADOWS map body so we're only checking usage sites
    const withoutMap = src.replace(/const SHADOWS[\s\S]*?\} as const;/, "SHADOWS_MAP_REMOVED");
    // after removing the map, there should be no remaining literal shadow strings
    expect(/boxShadow:\s*["'`]0/.test(withoutMap), "found a literal boxShadow string outside the SHADOWS map").toBe(false);
  });
});
