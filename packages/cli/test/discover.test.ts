// packages/cli/test/discover.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { discoverFromCss } from "../src/discover";

const here = dirname(fileURLToPath(import.meta.url)); // .../packages/cli/test
const css = readFileSync(
  resolve(here, "../../../__fixtures__/shadcn-tokens/globals.css"),
  "utf8",
);

describe("discoverFromCss (end-to-end against the shadcn-tokens fixture)", () => {
  const result = discoverFromCss(css);

  it("proposes a variableRoleMap a human would accept with light edits", () => {
    expect(result.variableRoleMap["--primary"]!.role).toBe("accent");
    expect(result.variableRoleMap["--background"]!.role).toBe("surface-0");
    expect(result.variableRoleMap["--foreground"]!.role).toBe("text-primary");
    expect(result.variableRoleMap["--border"]!.role).toBe("border");
  });

  it("reports honest coverage of the color surface", () => {
    expect(result.coverage.coverage).toBeCloseTo(0.8, 5); // 4 of 5 color vars
    expect(result.coverage.nonColor).toContain("--radius");
    expect(result.coverage.unclassified).toContain("--primary-foreground");
  });

  it("infers a coherent baseline StyleSpec (light, since surface-0 is white)", () => {
    expect(result.styleSpec.mode).toBe("light");
    expect(typeof result.styleSpec.accentHue).toBe("number");
  });
});
