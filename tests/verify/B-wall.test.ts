import { parseSpec } from "@invariance/theming";
import { describe, expect, it } from "vitest";
import { CARD_LOCK_CAN, SHADCN_CAN } from "./_fixtures.js";
import { APP_DEFAULT_SPEC, type Session, runTurn } from "./_cp.js";
import { rawStringify } from "./_util.js";

// ════════════════════════════════════════════════════════════════════════════
// GROUP B — THE WALL BOUNDS THE LLM (adversarial parseSpec)
// The StyleSpec wall is the security boundary: everything to its right is
// deterministic and never sees raw model text. We throw hostile raw JSON at it and
// assert REJECTION with the correct WallFailureCode — never silent coercion. The
// keystone is that a rejected turn NEVER mutates the session draft.
// ════════════════════════════════════════════════════════════════════════════

function expectReject(json: unknown, manifest = SHADCN_CAN) {
  const r = parseSpec(json, manifest);
  expect(r.ok, `expected rejection for ${JSON.stringify(json)} but got ok`).toBe(false);
  if (r.ok) throw new Error("unreachable");
  return r.failures;
}

function codes(failures: Array<{ code: string }>): string[] {
  return failures.map((f) => f.code);
}

describe("B1 — CSS breakout / unparseable colors → unparseable_color (never coerced)", () => {
  // On a NON-locked seed (accent) so the failure is unambiguously the color parser,
  // not the seed-lock projection.
  const hostile = [
    "red; } body{display:none} :root{",
    "#fff; } * { color: red }",
    "var(--evil)",
    "url(http://evil.example/x.png)",
    "expression(alert(1))",
    "javascript:alert(1)",
    "rgb(0 0 0) }",
    "<script>alert(1)</script>",
    "",
    "   ",
    "not-a-color",
  ];
  for (const value of hostile) {
    it(`accent = ${JSON.stringify(value)} → unparseable_color @ colors.accent`, () => {
      const failures = expectReject({ colors: { accent: value } });
      const f = failures.find((x) => x.path === "colors.accent");
      expect(f, JSON.stringify(failures)).toBeDefined();
      expect(f!.code).toBe("unparseable_color");
    });
  }

  it("a legitimate CSS named color still parses (the wall is not blanket-hostile)", () => {
    // culori parses named colors; "rebeccapurple" is a real CSS color → accepted.
    const r = parseSpec({ colors: { accent: "rebeccapurple" } }, SHADCN_CAN);
    expect(r.ok).toBe(true);
  });
});

describe("B2 — unknown keys (.strict closed schema) → unknown_key", () => {
  it("top-level invented field", () => {
    const failures = expectReject({ surprise: 1 });
    expect(codes(failures)).toContain("unknown_key");
    expect(failures.some((f) => f.path === "surprise")).toBe(true);
  });
  it("invented key inside colors", () => {
    const failures = expectReject({ colors: { brand: "#fff" } });
    expect(codes(failures)).toContain("unknown_key");
    expect(failures.some((f) => f.path === "colors.brand")).toBe(true);
  });
  it("invented key inside typography", () => {
    const failures = expectReject({ typography: { heading: "sans" } });
    expect(codes(failures)).toContain("unknown_key");
    expect(failures.some((f) => f.path === "typography.heading")).toBe(true);
  });
});

describe("B3 — font not in allowlist → font_not_allowed", () => {
  it("an arbitrary font id is rejected", () => {
    const failures = expectReject({ typography: { body: "comic-sans-99" } });
    const f = failures.find((x) => x.path === "typography.body");
    expect(f, JSON.stringify(failures)).toBeDefined();
    expect(f!.code).toBe("font_not_allowed");
  });
  it("the allowlisted id is accepted", () => {
    const r = parseSpec({ typography: { body: "sans" } }, SHADCN_CAN);
    expect(r.ok).toBe(true);
  });
  it("the removal sentinel (null) on a font slot is exempt (accepted)", () => {
    const r = parseSpec({ typography: { body: null } }, SHADCN_CAN);
    expect(r.ok).toBe(true);
  });
});

describe("B4 — out-of-range radius / invalid enums → out_of_range", () => {
  it("radius just past MAX_RADIUS_PX (24)", () => {
    expect(codes(expectReject({ radius: 24.001 }))).toContain("out_of_range");
  });
  it("radius far over", () => {
    expect(codes(expectReject({ radius: 100 }))).toContain("out_of_range");
  });
  it("negative radius", () => {
    expect(codes(expectReject({ radius: -1 }))).toContain("out_of_range");
  });
  it("the boundaries 0 and 24 are accepted", () => {
    expect(parseSpec({ radius: 0 }, SHADCN_CAN).ok).toBe(true);
    expect(parseSpec({ radius: 24 }, SHADCN_CAN).ok).toBe(true);
  });
  it("invalid density enum", () => {
    expect(codes(expectReject({ density: "cozy" }))).toContain("out_of_range");
  });
  it("invalid mode enum", () => {
    expect(codes(expectReject({ mode: "sepia" }))).toContain("out_of_range");
  });
});

describe("B5 — delta sets a LOCKED SEED → seed_locked (and derived-role locks pass the wall)", () => {
  it("setting the locked `primary` seed is rejected", () => {
    const failures = expectReject({ colors: { primary: "oklch(0.6 0.1 250)" } });
    const f = failures.find((x) => x.path === "colors.primary");
    expect(f, JSON.stringify(failures)).toBeDefined();
    expect(f!.code).toBe("seed_locked");
  });
  it("even the removal sentinel (null) on a locked seed is rejected (presence = setting it)", () => {
    const failures = expectReject({ colors: { primary: null } });
    expect(failures.find((x) => x.path === "colors.primary")?.code).toBe("seed_locked");
  });
  it("a DERIVED-role lock does NOT reject at the wall — re-seeding its feeder is allowed", () => {
    // CARD_LOCK_CAN locks `card` (derived from neutral). Setting `neutral` (its seed feeder)
    // must be ACCEPTED at the wall; the compiler pins `card` post-expansion.
    const r = parseSpec({ colors: { neutral: "oklch(0.5 0.02 250)" } }, CARD_LOCK_CAN);
    expect(r.ok, JSON.stringify(r)).toBe(true);
  });
});

describe("B6 — structural junk → schema_invalid", () => {
  it("a nullable-group set to null (groups are optional, not nullable)", () => {
    expect(codes(expectReject({ colors: null }))).toContain("schema_invalid");
  });
  it("a color leaf given a non-string", () => {
    expect(codes(expectReject({ colors: { accent: 123 } }))).toContain("schema_invalid");
  });
  for (const junk of [42, "a string", true, null, [], "not json at all"]) {
    it(`top-level non-spec value ${JSON.stringify(junk)}`, () => {
      expect(codes(expectReject(junk))).toContain("schema_invalid");
    });
  }
});

describe("B7 — phase ordering: schema failure short-circuits the manifest checks", () => {
  it("an unknown key + a locked-seed set → reports the schema failure, NOT seed_locked", () => {
    // unknown_key is a phase-1 (zod) failure; if phase-1 fails, the seed-lock / font checks never run.
    const failures = expectReject({ surprise: 1, colors: { primary: "oklch(0.6 0.1 250)" } });
    expect(codes(failures)).toContain("unknown_key");
    expect(codes(failures)).not.toContain("seed_locked");
  });
  it("manifest checks DO accumulate when the schema passes (seed_locked + font_not_allowed together)", () => {
    const failures = expectReject({
      colors: { primary: "oklch(0.5 0.1 200)" },
      typography: { body: "nope-font" },
    });
    expect(codes(failures)).toContain("seed_locked");
    expect(codes(failures)).toContain("font_not_allowed");
  });
});

// ── THE KEYSTONE ────────────────────────────────────────────────────────────
describe("B8 — failed turns never mutate the draft (corruption-by-conversation)", () => {
  it("parseSpec does not mutate its input json on rejection", () => {
    const json = { colors: { accent: "red; }evil{" }, radius: 99 };
    const snapshot = rawStringify(json);
    const r = parseSpec(json, SHADCN_CAN);
    expect(r.ok).toBe(false);
    expect(rawStringify(json)).toBe(snapshot);
  });

  it("runTurn leaves the session BYTE-IDENTICAL after every flavour of wall rejection", () => {
    // a non-trivial acknowledged draft
    const base: Session = {
      tenant: "acme",
      draft: { colors: { accent: "oklch(0.6 0.15 280)" }, radius: 10 },
      published: null,
    };
    const hostileDeltas: unknown[] = [
      { colors: { accent: "red; } body{}" } }, // unparseable_color
      { surprise: 1 }, // unknown_key
      { typography: { body: "no-such-font" } }, // font_not_allowed
      { radius: 999 }, // out_of_range
      { colors: { primary: "oklch(0.6 0.1 250)" } }, // seed_locked
      { colors: null }, // schema_invalid
      "not even an object", // schema_invalid
    ];
    for (const delta of hostileDeltas) {
      const before = rawStringify(base);
      const result = runTurn(base, delta, SHADCN_CAN);
      expect(result.kind, `delta ${JSON.stringify(delta)} should be rejected`).toBe("rejected");
      // session object (and its draft) is untouched — runTurn is pure, advances only via acknowledge()
      expect(rawStringify(base)).toBe(before);
    }
    // and the draft is still exactly what we started with
    expect(rawStringify(base.draft)).toBe(rawStringify({ colors: { accent: "oklch(0.6 0.15 280)" }, radius: 10 }));
  });
});
