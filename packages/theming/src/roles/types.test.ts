// packages/theming/src/roles/types.test.ts
import { describe, it, expectTypeOf } from "vitest";
import type {
  SeedId,
  RoleId,
  StepId,
  VarName,
  Kind,
  Mode,
  SpecMode,
  ContrastCategory,
  ContrastTier,
  FontStackId,
  Derivation,
  ContrastPair,
  RoleGraph,
} from "./types.js";

describe("roles/types", () => {
  it("primitive aliases resolve to string / literal unions", () => {
    expectTypeOf<SeedId>().toEqualTypeOf<string>();
    expectTypeOf<RoleId>().toEqualTypeOf<string>();
    expectTypeOf<StepId>().toEqualTypeOf<string>();
    expectTypeOf<VarName>().toEqualTypeOf<string>();
    expectTypeOf<FontStackId>().toEqualTypeOf<string>();
    expectTypeOf<Kind>().toEqualTypeOf<"color" | "dimension" | "typography">();
    expectTypeOf<Mode>().toEqualTypeOf<"light" | "dark">();
    expectTypeOf<SpecMode>().toEqualTypeOf<"light" | "dark" | "both">();
    expectTypeOf<ContrastCategory>().toEqualTypeOf<"text" | "large-text" | "ui">();
    expectTypeOf<ContrastTier>().toEqualTypeOf<"AA" | "AAA">();
  });

  it("Derivation is a discriminated union keyed on kind", () => {
    const d: Derivation = { kind: "foreground-of", bg: "card", strategy: "maximize-contrast" };
    expectTypeOf(d).toMatchTypeOf<Derivation>();
    const pick: Derivation = { kind: "pick", axis: "body" };
    expectTypeOf(pick).toMatchTypeOf<Derivation>();
  });

  it("RoleGraph composes roles + contrastPairs", () => {
    const graph: RoleGraph = {
      seeds: ["primary"],
      roles: { primary: { kind: "color", derivation: { kind: "seed", seed: "primary" } } },
      contrastPairs: [{ fg: "foreground", bg: "background", category: "text" }],
    };
    expectTypeOf(graph.contrastPairs[0]).toMatchTypeOf<ContrastPair>();
  });
});
