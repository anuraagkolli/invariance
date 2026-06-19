// packages/theming/test/artifact/deps.test.ts
import { describe, it, expect } from "vitest";
import * as deps from "../../src/artifact/deps.js";

describe("artifact/deps shim", () => {
  it("re-exports isSafeCssTokenValue as a callable function", () => {
    expect(typeof deps.isSafeCssTokenValue).toBe("function");
    // A plainly safe token round-trips true; this is the contract the applier relies on.
    expect(deps.isSafeCssTokenValue("oklch(0.5 0.1 200)")).toBe(true);
  });
});
