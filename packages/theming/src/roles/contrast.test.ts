// packages/theming/src/roles/contrast.test.ts
import { describe, it, expect } from "vitest";
import { requiredContrast } from "./contrast.js";

describe("requiredContrast (f-table §6)", () => {
  it("AA row", () => {
    expect(requiredContrast("AA", "text")).toBe(4.5);
    expect(requiredContrast("AA", "large-text")).toBe(3.0);
    expect(requiredContrast("AA", "ui")).toBe(3.0);
  });

  it("AAA row", () => {
    expect(requiredContrast("AAA", "text")).toBe(7.0);
    expect(requiredContrast("AAA", "large-text")).toBe(4.5);
    expect(requiredContrast("AAA", "ui")).toBe(3.0); // ui stays 3.0 at AAA — WCAG does not raise non-text contrast
  });
});
