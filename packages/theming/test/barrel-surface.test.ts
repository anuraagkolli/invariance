import { describe, it, expect } from "vitest";
import * as theming from "../src/index.js";

describe("@invariance/theming barrel surface (Plan 02 additions)", () => {
  it("exports the profile contract", () => {
    expect(theming.PROFILE_VERSION).toBe("iv-profile-1");
    expect(theming.ivProfile1).toBeDefined();
    expect(typeof theming.getRampProfile).toBe("function");
  });
  it("exports compile + CandidateTheme runtime entry", () => {
    expect(typeof theming.compile).toBe("function");
  });
});
