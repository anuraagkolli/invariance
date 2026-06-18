// packages/theming/src/scaffold.test.ts
import { describe, it, expect } from "vitest";
import { wcagContrast } from "culori";
import { z } from "zod";

describe("theming package scaffold", () => {
  it("loads culori (WCAG contrast white-on-black ≈ 21)", () => {
    const ratio = wcagContrast("#ffffff", "#000000");
    expect(ratio).toBeGreaterThan(20.9);
    expect(ratio).toBeLessThan(21.1);
  });

  it("loads zod", () => {
    const schema = z.object({ a: z.number() });
    expect(schema.parse({ a: 1 })).toEqual({ a: 1 });
  });
});
