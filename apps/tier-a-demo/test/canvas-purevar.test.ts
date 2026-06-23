import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("canvas is pure-var (no dark: utilities → one source of truth)", () => {
  it("AnalyticsDashboard.tsx contains no `dark:` Tailwind utility", () => {
    const src = readFileSync(fileURLToPath(new URL("../src/canvas/AnalyticsDashboard.tsx", import.meta.url)), "utf8");
    // a `dark:` utility would activate off the .dark class as a SECOND source of truth beside the vars
    expect(/(^|[\s"'`])dark:/.test(src), "found a dark: utility — the canvas must theme only via hsl(var(--x))").toBe(false);
  });
});
