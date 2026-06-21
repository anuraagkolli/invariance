import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { canonicalize, compile, parseSpec } from "@invariance/theming";
import { describe, expect, it } from "vitest";
import { DRAFTS, NO_LOCKS_CAN, SHADCN_CAN, TWO_MODE_CAN } from "./_fixtures.js";
import { mulberry32, randomAcceptedDeltaJson, rawStringify, reinsertShuffled, sortedStringify } from "./_util.js";

// ════════════════════════════════════════════════════════════════════════════
// GROUP A — DETERMINISM (HALT BAR)
// compile() is the foundation everything else rests on. If it wobbles, nothing
// downstream is trustworthy. We test run-to-run, cross-process, and over random
// valid inputs. Output is compared with RAW (insertion-order-preserving) stringify
// so value OR key-order drift both surface.
// ════════════════════════════════════════════════════════════════════════════

const here = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

function compileDrafts(manifest: Parameters<typeof compile>[1]) {
  return DRAFTS.map((d) => {
    const parsed = parseSpec(d.json, manifest);
    if (!parsed.ok) throw new Error(`draft ${d.name} rejected: ${JSON.stringify(parsed.failures)}`);
    return { name: d.name, theme: compile(parsed.spec, manifest) };
  });
}

function inProcessAll() {
  return { shadcn: compileDrafts(SHADCN_CAN), twoMode: compileDrafts(TWO_MODE_CAN) };
}

describe("A1 — compile is run-to-run byte-identical (100× in-process)", () => {
  for (const manifest of [SHADCN_CAN, TWO_MODE_CAN]) {
    for (const d of DRAFTS) {
      it(`${manifest.appId} / ${d.name}: 100 compiles produce one byte string`, () => {
        const parsed = parseSpec(d.json, manifest);
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        const first = rawStringify(compile(parsed.spec, manifest));
        for (let i = 0; i < 100; i++) {
          expect(rawStringify(compile(parsed.spec, manifest))).toBe(first);
        }
      });
    }
  }
});

describe("A2 — compile in a FRESH PROCESS is byte-identical (global state / map-order / locale / TZ)", () => {
  const baselinePath = here("./__fixtures__/A-compile-baseline.json");

  it("a committed baseline exists (regression anchor)", () => {
    expect(existsSync(baselinePath)).toBe(true);
  });

  it("in-process output matches the committed baseline byte-for-byte", () => {
    const baseline = readFileSync(baselinePath, "utf8");
    expect(rawStringify(inProcessAll())).toBe(baseline.trim());
  });

  it("fresh process under mutated LC_ALL=de_DE.UTF-8 + TZ=Asia/Kolkata equals the in-process baseline", () => {
    const tsxBin = here("./node_modules/.bin/tsx");
    const childTs = here("./_compile-child.ts");
    const stdout = execFileSync(tsxBin, [childTs], {
      encoding: "utf8",
      cwd: here("./"),
      env: {
        ...process.env,
        LC_ALL: "de_DE.UTF-8",
        LANG: "de_DE.UTF-8",
        LANGUAGE: "de_DE",
        TZ: "Asia/Kolkata",
      },
    });
    expect(stdout).toBe(rawStringify(inProcessAll()));
  });
});

describe("A3 — property: determinism over random VALID StyleSpecs", () => {
  const SEED = 0xc0ffee;
  const N = 250;

  it(`${N} random accepted specs: compile twice → byte-identical`, () => {
    const rng = mulberry32(SEED);
    for (let i = 0; i < N; i++) {
      const json = randomAcceptedDeltaJson(rng);
      const parsed = parseSpec(json, SHADCN_CAN);
      expect(parsed.ok, `spec #${i} ${JSON.stringify(json)} should be accepted`).toBe(true);
      if (!parsed.ok) continue;
      const a = rawStringify(compile(parsed.spec, SHADCN_CAN));
      const b = rawStringify(compile(parsed.spec, SHADCN_CAN));
      expect(a, `spec #${i} ${JSON.stringify(json)}`).toBe(b);
    }
  });

  it("input draft key-INSERTION order does not change output", () => {
    const rng = mulberry32(SEED ^ 0x1234);
    for (let i = 0; i < N; i++) {
      const json = randomAcceptedDeltaJson(rng);
      const parsed = parseSpec(json, SHADCN_CAN);
      if (!parsed.ok) continue;
      const canonical = compile(parsed.spec, SHADCN_CAN);
      const shuffled = compile(reinsertShuffled(parsed.spec, rng) as typeof parsed.spec, SHADCN_CAN);
      expect(rawStringify(shuffled), `spec #${i} ${JSON.stringify(json)}`).toBe(rawStringify(canonical));
    }
  });

  it("specs that canonicalize identically (redundant null on an unset field) compile identically", () => {
    // compile()'s contract input is the post-merge, null-free, canonicalized draft (the session
    // always canonicalizes before compiling). So the property is: canonicalize(A) ≡ canonicalize(B)
    // ⟹ compile(canon A) ≡ compile(canon B). We add a removal sentinel on an UNSET field; canonicalize
    // must strip it, yielding the same canonical draft and therefore byte-identical compile output.
    const rng = mulberry32(SEED ^ 0x9999);
    for (let i = 0; i < 120; i++) {
      const json = randomAcceptedDeltaJson(rng);
      const withNoise: Record<string, unknown> = { ...json };
      if (withNoise.radius === undefined) withNoise.radius = null;
      else if (withNoise.density === undefined) withNoise.density = null;
      else if (withNoise.mode === undefined) withNoise.mode = null;
      const a = parseSpec(json, SHADCN_CAN);
      const b = parseSpec(withNoise, SHADCN_CAN);
      if (!a.ok || !b.ok) continue;
      const ca = canonicalize(a.spec);
      const cb = canonicalize(b.spec);
      // the redundant null must vanish under canonicalize → identical canonical drafts
      expect(sortedStringify(cb), `canonical forms differ for #${i} ${JSON.stringify(json)}`).toBe(
        sortedStringify(ca),
      );
      // and therefore byte-identical compile output
      expect(rawStringify(compile(cb, SHADCN_CAN)), `spec #${i} ${JSON.stringify(json)}`).toBe(
        rawStringify(compile(ca, SHADCN_CAN)),
      );
    }
  });
});

describe("A — sanity: the no-locks manifest fixture compiles deterministically too", () => {
  it("NO_LOCKS_CAN with a primary re-seed is run-to-run identical", () => {
    const parsed = parseSpec({ colors: { primary: "oklch(0.6 0.18 280)" } }, NO_LOCKS_CAN);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const first = rawStringify(compile(parsed.spec, NO_LOCKS_CAN));
    for (let i = 0; i < 20; i++) {
      expect(rawStringify(compile(parsed.spec, NO_LOCKS_CAN))).toBe(first);
    }
  });
});
