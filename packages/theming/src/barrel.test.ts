// packages/theming/src/barrel.test.ts
import { describe, it, expect } from "vitest";
import {
  VOCAB_VERSION,
  ivRoles1,
  getRoleGraph,
  requiredContrast,
  isModePolarized,
  classifySeedOrDerived,
  repairTarget,
  OklchColor,
  StyleSpec,
  MAX_RADIUS_PX,
  FontStackId,
  parseSpec,
  AppManifest,
  SHADCN_CAN,
  mergeDelta,
  canonicalize,
  diffSpecs,
} from "./index.js";

describe("@invariance/theming barrel", () => {
  it("re-exports the cross-plan contracts that Plans 02–07 import", () => {
    expect(VOCAB_VERSION).toBe("iv-roles-1");
    expect(typeof getRoleGraph).toBe("function");
    expect(typeof requiredContrast).toBe("function");
    expect(typeof isModePolarized).toBe("function");
    expect(typeof classifySeedOrDerived).toBe("function");
    expect(typeof repairTarget).toBe("function");
    expect(typeof parseSpec).toBe("function");
    expect(typeof mergeDelta).toBe("function");
    expect(typeof canonicalize).toBe("function");
    expect(typeof diffSpecs).toBe("function");
    expect(MAX_RADIUS_PX).toBe(24);
    // schema values are present
    expect(OklchColor.safeParse("#fff").success).toBe(true);
    expect(StyleSpec.safeParse({}).success).toBe(true);
    expect(FontStackId.safeParse("sans").success).toBe(true);
    expect(AppManifest.safeParse(SHADCN_CAN).success).toBe(true);
    expect(ivRoles1.seeds).toContain("neutral");
  });

  it("end-to-end: parse → merge → diff against SHADCN_CAN", () => {
    const a = parseSpec({ colors: { accent: "#3366ff" } }, SHADCN_CAN);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    const draft = mergeDelta({} as StyleSpec, a.spec);
    const b = parseSpec({ radius: 12 }, SHADCN_CAN);
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    const draft2 = mergeDelta(draft, b.spec);
    const diff = diffSpecs(draft, draft2, SHADCN_CAN);
    expect(diff.some((d) => d.role === "radius" && d.kind === "added")).toBe(true);
  });
});
