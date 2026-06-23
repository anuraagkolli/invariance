import { compile, parseSpec, SHADCN_CAN } from "@invariance/theming";
import { describe, expect, it } from "vitest";

describe("scaffold", () => {
  it("resolves @invariance/theming and compiles the can to a bare HSL triple", () => {
    const parsed = parseSpec({}, SHADCN_CAN);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const theme = compile(parsed.spec, SHADCN_CAN);
    expect(theme.light["--background"]).toMatch(/^-?\d/); // a bare triple, not "#..."
  });
});
