// packages/client/test/theming/applier.test.ts
import { describe, it, expect } from "vitest";
import * as applier from "../../src/theming/applier.js";
import { renderStyleText, applyTheme } from "@invariance/theming";

describe("client data-plane applier re-export", () => {
  it("re-exports the SAME renderStyleText/applyTheme from @invariance/theming", () => {
    expect(applier.renderStyleText).toBe(renderStyleText);
    expect(applier.applyTheme).toBe(applyTheme);
  });
});
