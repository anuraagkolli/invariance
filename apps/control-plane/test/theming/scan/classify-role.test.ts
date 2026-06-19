// apps/control-plane/src/theming/scan/classify-role.test.ts
import { describe, it, expect } from "vitest";
import { getRoleGraph, VOCAB_VERSION } from "@invariance/theming";
import { classifyRole } from "../../../src/theming/scan/classify-role.js";

const graph = getRoleGraph(VOCAB_VERSION);

describe("classifyRole", () => {
  // classifyRole is the PARSE GATE: given a held value + format, it answers "is this a
  // classifiable color/dimension leaf?" (non-null) or "not a theme leaf" (null). It does
  // NOT see the var name; the Scanner (Task 7) binds the concrete RoleId by canonical name
  // and uses `classifyRole` only for its non-null/null verdict — so the color-leaf sentinel
  // role is never surfaced.
  it("gates a color-parseable held value as a confirmed color leaf", () => {
    const out = classifyRole("240 5.9% 10%", "hsl-triple", graph);
    expect(out).not.toBeNull();
    expect(out!.confidence).toBe("confirmed");
  });

  it("returns null when a color leaf fails to parse (not a color)", () => {
    const out = classifyRole("'Inter', sans-serif", "unknown", graph);
    expect(out).toBeNull();
  });

  it("classifies a number leaf as the radius dimension role", () => {
    const out = classifyRole("0.5rem", "number", graph);
    expect(out).not.toBeNull();
    expect(out!.role).toBe("radius");
  });
});
