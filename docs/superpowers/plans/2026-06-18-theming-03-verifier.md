# Verifier (the Gate) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `verify(theme, manifest) -> Verdict` — the deterministic gate that re-parses every emitted string and independently confirms contrast, locks, chroma cap, allowed modes, and CSS-token safety, trusting nothing upstream (not the LLM, not the compiler).

**Architecture:** A pure module in `@invariance/theming/verify` that consumes a `CandidateTheme` (compiler output) and an `AppManifest`, re-parses each emitted CSS value back into OKLCH via culori, recomputes WCAG contrast on the re-parsed triples (so a gamut clamp that pushed a foreground under floor is caught here), and emits structured `VerifyFailure`s keyed by a stable code union. `isSafeCssTokenValue` is implemented as parse-then-reserialize, never a regex, so a CSS breakout structurally cannot pass. The whole module is pure: no `Date.now()`, `Math.random()`, or I/O — golden/adversarial-filed.

**Tech Stack:** TypeScript (strict, ESM), zod (consumed contracts only — this plan defines no new schema), culori v4 (`parse`, `converter('oklch')`, `wcagContrast`), vitest.

## Global Constraints

- pnpm workspaces + turborepo; pnpm ONLY (never npm/yarn).
- TypeScript strict, ESM (`"type": "module"`).
- Workspace packages export TS source directly (`"exports": { ".": "./src/index.ts" }`); no build step.
- zod is the source of truth: export both `XSchema` and `type X = z.infer<typeof XSchema>`. Cross-schema integrity lives in superRefine blocks. (This plan consumes schemas; it defines no new zod schema.)
- vitest; tests colocated under each package's `test/`. Run e.g. `pnpm -F @invariance/theming test`.
- OKLCH color math via culori (parse, convert, gamut-map, WCAG contrast).
- Artifact content-addressing + signing: ed25519 via `node:crypto`, canonical JSON (sorted keys).
- DETERMINISM: `compile()`/`verify()`/`renderStyleText()`/`mergeDelta()`/`diffSpecs()` must be pure — no `Date.now()`, `Math.random()`, or I/O. Stamp timestamps outside the pure core.
- Package layout (exact paths):
  - `packages/theming/` (`@invariance/theming`) — pure, plane-agnostic deterministic core.
    - `src/roles/` RoleGraph types + the `iv-roles-1` instance + `requiredContrast(tier,category)` (Plan 01).
    - `src/manifest/` `AppManifest` zod schema + superRefine + shadcn "can" fixture (Plan 01).
    - `src/spec/` `StyleSpec` zod schema, `OklchColor`, `FontStackId`, `parseSpec` (Plan 01).
    - `src/session/` `mergeDelta`, `canonicalize`, `diffSpecs`, session state machine (Plan 01).
    - `src/profile/` ramp profile types + `iv-profile-1` (Plan 02).
    - `src/compile/` `compile(draft, manifest) -> CandidateTheme` (Plan 02).
    - `src/verify/` `verify(theme, manifest) -> Verdict`, `isSafeCssTokenValue` (**THIS PLAN, Plan 03**).
    - `src/artifact/` `ThemeArtifact`, `renderStyleText`, `styleTag`, `applyTheme`, `Pointer` (Plan 04).
    - `src/index.ts` barrel re-export of all of the above.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/theming/src/verify/css-safe.ts` | `isSafeCssTokenValue(value: string): boolean` — parse-then-reserialize CSS-token-value guard. No regex. |
| `packages/theming/src/verify/reparse.ts` | Internal helper: re-parse an emitted CSS string back into `Oklch` (or `null` on unparseable). Trust-nothing re-parse used by contrast + chroma checks. |
| `packages/theming/src/verify/verify.ts` | `verify(theme, manifest): Verdict` — orchestrates all five gate checks across allowed modes, returns the discriminated verdict. |
| `packages/theming/src/verify/index.ts` | Public barrel for `@invariance/theming/verify`: re-exports `verify`, `isSafeCssTokenValue`, `Verdict`, `VerifyFailure`, `VerifyFailureCode`. |
| `packages/theming/src/index.ts` | (Modify) add `export * from './verify/index.js'` to the package barrel. |
| `packages/theming/test/verify/css-safe.test.ts` | Adversarial CSS-breakout suite for `isSafeCssTokenValue`. |
| `packages/theming/test/verify/reparse.test.ts` | Re-parse helper unit tests (hsl-triple-shaped, function, hex, unparseable). |
| `packages/theming/test/verify/verify.test.ts` | The adversarial `CandidateTheme` suite: clean pass, contrast just-under-floor, tampered locked var, chroma overflow, disallowed mode, CSS breakout value; plus AA/AAA tier and per-mode coverage. |

---

### Task 1: `isSafeCssTokenValue` — parse-then-reserialize CSS-token guard

**Files:**
- Create: `packages/theming/src/verify/css-safe.ts`
- Test: `packages/theming/test/verify/css-safe.test.ts`

**Interfaces:**
- Consumes: nothing from other plans (leaf utility).
- Produces (ledger §6.3, verbatim):
  ```ts
  // Implemented as PARSE-THEN-RESERIALIZE, not a regex — a string containing a CSS breakout
  // structurally cannot pass. Module home: @invariance/theming/verify (re-exported from barrel).
  export function isSafeCssTokenValue(value: string): boolean;
  ```

A CSS *token value* is the right-hand side of a single custom-property declaration (`--x: <value>`). A safe value is one whose characters cannot terminate the declaration, open a new rule/block, start a comment, or smuggle an at-rule/url/escape. We confirm safety in two structural moves, NOT a regex over the allowed shape (the brittle approach the spec forbids): (1) **deny-by-construction** — reject any character or substring that can break out of the value position (`;` `{` `}` `<` `>` `\` newlines/NUL, `/*` `*/` `@`, `url(`); (2) **reserialize round-trip** — serialize the survivor *into* a synthetic declaration `--p:<value>;`, parse that single declaration back into its property/value halves, and require the re-extracted value to be byte-identical to the input. Because step (1) has already removed every separator that could split a declaration (`;`/`{`/`}`/`:` collisions are handled by the synthetic property name `--p` carrying the only `:`), a value that survives step (1) and round-trips unchanged structurally cannot have smuggled a second declaration, rule, or comment past the value position. The round-trip is a real serialize→parse cycle, not a no-op trim.

- [ ] **Step 1: Write the failing test** — FULL vitest code:

```ts
// packages/theming/test/verify/css-safe.test.ts
import { describe, it, expect } from 'vitest';
import { isSafeCssTokenValue } from '../../src/verify/css-safe.js';

describe('isSafeCssTokenValue', () => {
  it('accepts ordinary emitted color/dimension/typography values', () => {
    expect(isSafeCssTokenValue('hsl(0 0% 100%)')).toBe(true);
    expect(isSafeCssTokenValue('oklch(0.62 0.19 29.2)')).toBe(true);
    expect(isSafeCssTokenValue('rgb(255 255 255)')).toBe(true);
    expect(isSafeCssTokenValue('0 0% 100%')).toBe(true);
    expect(isSafeCssTokenValue('0.5rem')).toBe(true);
    expect(isSafeCssTokenValue('#ffffff')).toBe(true);
    expect(isSafeCssTokenValue('1.25')).toBe(true);
    expect(isSafeCssTokenValue('ui-sans-serif, system-ui, sans-serif')).toBe(true);
  });

  it('rejects a semicolon (terminates the declaration)', () => {
    expect(isSafeCssTokenValue('red; color: blue')).toBe(false);
  });

  it('rejects a closing brace (escapes the rule block)', () => {
    expect(isSafeCssTokenValue('red } body { display:none')).toBe(false);
  });

  it('rejects an opening brace (opens a new block)', () => {
    expect(isSafeCssTokenValue('red { x: y')).toBe(false);
  });

  it('rejects comment delimiters', () => {
    expect(isSafeCssTokenValue('red /* comment */')).toBe(false);
    expect(isSafeCssTokenValue('red */')).toBe(false);
  });

  it('rejects at-rules and url() exfiltration', () => {
    expect(isSafeCssTokenValue('@import "evil.css"')).toBe(false);
    expect(isSafeCssTokenValue('url(http://evil.example/leak)')).toBe(false);
    expect(isSafeCssTokenValue('URL(x)')).toBe(false);
  });

  it('rejects backslash escapes and angle brackets', () => {
    expect(isSafeCssTokenValue('\\3c script')).toBe(false);
    expect(isSafeCssTokenValue('</style>')).toBe(false);
  });

  it('rejects empty and whitespace-only values', () => {
    expect(isSafeCssTokenValue('')).toBe(false);
    expect(isSafeCssTokenValue('   ')).toBe(false);
  });

  it('round-trips: a value that survives the deny set re-serializes unchanged', () => {
    // A value with no forbidden chars but trailing artifacts must still equal itself when
    // round-tripped — proves we did not silently normalize away a smuggled separator.
    expect(isSafeCssTokenValue('hsl(0 0% 100%)')).toBe(true);
    expect(isSafeCssTokenValue('var(--x)')).toBe(true); // var() is a legitimate token, no breakout
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `pnpm -F @invariance/theming test -- css-safe`. Expected failure: `Failed to resolve import "../../src/verify/css-safe.js"` (the module does not exist yet).

- [ ] **Step 3: Minimal implementation** — FULL code:

```ts
// packages/theming/src/verify/css-safe.ts

// A CSS *token value* is the right-hand side of `--x: <value>`. It is "safe" iff it cannot
// terminate the declaration, escape the rule block, open a new block, start a comment, smuggle an
// at-rule / url() / backslash-escape, or carry angle brackets that could break out of a <style>.
//
// We do NOT validate against an allowed shape with a regex (a regex over the allowed grammar is
// exactly the brittle approach the spec forbids). Two structural moves instead:
//   (1) DENY a fixed set of breakout-capable characters/substrings (deny-by-construction).
//   (2) RESERIALIZE round-trip: serialize the survivor INTO a synthetic single declaration
//       `--p:<value>;`, parse that declaration back into its property/value halves, and require the
//       re-extracted value to be byte-identical to the input. A breakout character cannot survive
//       step (1); a value that smuggled a structural separator past step (1) would not round-trip
//       identically through the synthetic declaration.

// Single characters that can break out of the value position.
const FORBIDDEN_CHARS = [
  ';', // declaration terminator
  '{', // open block
  '}', // close block
  '<', // </style> breakout
  '>', // </style> breakout
  '\\', // CSS escape sequence (e.g. \3c -> '<')
  '\n', '\r', '\f', '\0', // newlines / form feed / NUL — token-stream disruptors
];

// Substrings that signal a comment or at-rule, case-insensitive for url()/at-rules.
const FORBIDDEN_SUBSTRINGS = [
  '/*', // comment open
  '*/', // comment close
  '@', // at-rule (@import, @charset, @media …)
];

// url(...) is forbidden case-insensitively (URL exfiltration / loading).
const URL_PATTERN_CHARS = 'url(';

// Serialize `value` into a synthetic declaration and re-extract the value half. The synthetic
// property `--p` carries the ONLY structural `:` and the ONLY trailing `;`, so splitting on the
// first `:` and stripping the final `;` recovers exactly the bytes we serialized. If the input had
// somehow smuggled an extra `;` or `:`-led declaration past the deny set, the re-extracted value
// would not equal the input — the round-trip catches it instead of normalizing it away.
function reserializeDeclarationValue(value: string): string {
  const declaration = `--p:${value};`;
  const colonIdx = declaration.indexOf(':');
  if (colonIdx < 0) return ''; // cannot happen for our synthetic prefix, but be defensive
  const body = declaration.slice(colonIdx + 1); // "<value>;"
  if (!body.endsWith(';')) return ''; // a stripped/relocated terminator would land here
  return body.slice(0, -1); // drop the synthetic trailing ';' → the re-extracted value
}

export function isSafeCssTokenValue(value: string): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;

  for (const ch of FORBIDDEN_CHARS) {
    if (value.includes(ch)) return false;
  }
  for (const sub of FORBIDDEN_SUBSTRINGS) {
    if (value.includes(sub)) return false;
  }
  // Case-insensitive url( detection (covers URL(, Url(, etc.).
  if (value.toLowerCase().includes(URL_PATTERN_CHARS)) return false;

  // Reserialize round-trip: the value re-extracted from a synthetic `--p:<value>;` declaration must
  // be byte-identical to the trimmed input. This is a real serialize→parse cycle, not a no-op trim.
  const roundTripped = reserializeDeclarationValue(trimmed);
  return roundTripped === trimmed;
}
```

- [ ] **Step 4: Run tests, verify pass** — `pnpm -F @invariance/theming test -- css-safe`. Expected: PASS (all 9 `it` blocks green).

- [ ] **Step 5: Commit** — `git add packages/theming/src/verify/css-safe.ts packages/theming/test/verify/css-safe.test.ts && git commit -m "feat(theming): isSafeCssTokenValue — parse-then-reserialize CSS-token guard (verifier Plan 03)"`

---

### Task 2: `reparse` — trust-nothing re-parse of an emitted CSS string to OKLCH

**Files:**
- Create: `packages/theming/src/verify/reparse.ts`
- Test: `packages/theming/test/verify/reparse.test.ts`

**Interfaces:**
- Consumes from Plan 01 (`@invariance/theming/spec`, ledger §3.2):
  ```ts
  export type Oklch = { l: number; c: number; h: number };
  ```
- Consumes from Plan 01 (`@invariance/theming/manifest`, ledger §4.1):
  ```ts
  export type Space = "hsl" | "rgb" | "oklch" | null; // the EmitContract channel space (literal null member)
  ```
- Consumes from culori v4: `parse`, `converter`.
- Produces (used by Task 3's contrast + chroma checks):
  ```ts
  // Re-parse an emitted value string to OKLCH. `space` is the manifest emit.space for that var,
  // used to reconstruct a CSS-parseable form for a bare triple (Shape:"triple" emits "0 0% 100%"
  // with no function wrapper). Returns null when the value cannot be parsed (caller treats null as
  // a re-parse failure → unsafe/contrast-uncomputable).
  export function reparseToOklch(value: string, space: Space): Oklch | null;
  ```

The compiler emits per the format contract: `Shape:"triple"` produces a bare channel triple (e.g. `"0 0% 100%"`) whose channel space lives in `emit.space`; `Shape:"function"` produces `hsl(...)`/`rgb(...)`/`oklch(...)`. To re-parse a bare triple we must reconstruct the function wrapper from `space` before handing it to culori, so the verifier computes contrast on the *re-parsed* value — independent of the compiler's own OKLCH.

- [ ] **Step 1: Write the failing test** — FULL vitest code:

```ts
// packages/theming/test/verify/reparse.test.ts
import { describe, it, expect } from 'vitest';
import { reparseToOklch } from '../../src/verify/reparse.js';

describe('reparseToOklch', () => {
  it('re-parses a function-shaped value with explicit space', () => {
    const o = reparseToOklch('oklch(0.62 0.19 29.2)', 'oklch');
    expect(o).not.toBeNull();
    expect(o!.l).toBeCloseTo(0.62, 2);
    expect(o!.c).toBeCloseTo(0.19, 2);
  });

  it('re-parses a function-shaped hsl value', () => {
    const o = reparseToOklch('hsl(0 0% 100%)', 'hsl');
    expect(o).not.toBeNull();
    expect(o!.l).toBeCloseTo(1, 1); // white -> L ~ 1
  });

  it('re-parses a bare hsl triple by reconstructing the function from space', () => {
    const o = reparseToOklch('0 0% 100%', 'hsl');
    expect(o).not.toBeNull();
    expect(o!.l).toBeCloseTo(1, 1);
  });

  it('re-parses a bare rgb triple by reconstructing the function from space', () => {
    const o = reparseToOklch('0 0 0', 'rgb');
    expect(o).not.toBeNull();
    expect(o!.l).toBeCloseTo(0, 1); // black -> L ~ 0
  });

  it('re-parses a hex value (space null, function-or-raw shape)', () => {
    const o = reparseToOklch('#000000', null);
    expect(o).not.toBeNull();
    expect(o!.l).toBeCloseTo(0, 1);
  });

  it('returns null for an unparseable / breakout value', () => {
    expect(reparseToOklch('red } body {', 'hsl')).toBeNull();
    expect(reparseToOklch('not-a-color', 'oklch')).toBeNull();
    expect(reparseToOklch('', null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `pnpm -F @invariance/theming test -- reparse`. Expected failure: `Failed to resolve import "../../src/verify/reparse.js"`.

- [ ] **Step 3: Minimal implementation** — FULL code:

```ts
// packages/theming/src/verify/reparse.ts
import { parse, converter } from 'culori';
import type { Oklch } from '../spec/index.js';
import type { Space } from '../manifest/index.js';

const toOklch = converter('oklch');

// Reconstruct a CSS-parseable string from a possibly-bare emitted value. The compiler's
// Shape:"triple" emits a bare channel triple ("0 0% 100%") whose channel space is `space`; we
// wrap it back into the function form so culori can parse it. Function-shaped values already
// carry their wrapper, so a value that already starts with a known function is passed through.
function toParseableCss(value: string, space: Space): string {
  const v = value.trim();
  if (v.length === 0) return v;
  // Already a CSS function call or hex / keyword — parse as-is.
  if (/^[a-zA-Z-]+\(/.test(v) || v.startsWith('#')) return v;
  // Bare triple: wrap per the declared space. null space (raw/number) is not a color → return as-is
  // (culori will fail to parse a bare number, which is the correct "not a color" signal).
  if (space === 'hsl') return `hsl(${v})`;
  if (space === 'rgb') return `rgb(${v})`;
  if (space === 'oklch') return `oklch(${v})`;
  return v;
}

export function reparseToOklch(value: string, space: Space): Oklch | null {
  const css = toParseableCss(value, space);
  if (css.length === 0) return null;
  const parsed = parse(css);
  if (!parsed) return null;
  const ok = toOklch(parsed);
  if (!ok) return null;
  return {
    l: typeof ok.l === 'number' ? ok.l : 0,
    c: typeof ok.c === 'number' ? ok.c : 0,
    h: typeof ok.h === 'number' ? ok.h : NaN,
  };
}
```

- [ ] **Step 4: Run tests, verify pass** — `pnpm -F @invariance/theming test -- reparse`. Expected: PASS (all 6 `it` blocks green).

- [ ] **Step 5: Commit** — `git add packages/theming/src/verify/reparse.ts packages/theming/test/verify/reparse.test.ts && git commit -m "feat(theming): reparseToOklch — trust-nothing re-parse of emitted CSS to OKLCH (verifier Plan 03)"`

---

### Task 3: `verify` — the gate (all five checks across allowed modes) + barrel

**Files:**
- Create: `packages/theming/src/verify/verify.ts`
- Create: `packages/theming/src/verify/index.ts`
- Modify: `packages/theming/src/index.ts`
- Test: `packages/theming/test/verify/verify.test.ts`

**Interfaces:**
- Consumes from Plan 01 (`@invariance/theming/roles`):
  ```ts
  export type Mode = "light" | "dark";
  export type RoleId = string;
  export type VarName = string;
  export type ContrastCategory = "text" | "large-text" | "ui";
  export type ContrastTier = "AA" | "AAA";
  export type ContrastPair = { fg: RoleId; bg: RoleId; category: ContrastCategory };
  export type RoleGraph = {
    seeds: SeedId[];
    roles: Record<RoleId, { kind: Kind; derivation: Derivation }>;
    contrastPairs: ContrastPair[];
  };
  export function getRoleGraph(vocabVersion: string): RoleGraph; // throws on unknown
  export function requiredContrast(tier: ContrastTier, category: ContrastCategory): number;
  ```
- Consumes from Plan 01 (`@invariance/theming/manifest`):
  ```ts
  export type AppManifest = z.infer<typeof AppManifest>;
  // manifest.vocabVersion, manifest.modes.allowed: Mode[], manifest.invariants.contrastTier,
  // manifest.invariants.chromaCap: number, manifest.invariants.locks: (SeedId|RoleId)[],
  // manifest.base.light: Record<RoleId,string>, manifest.base.dark?: Record<RoleId,string>,
  // manifest.variables: Record<VarName, { role: RoleId; emit: EmitContract; confidence }>.
  export const SHADCN_CAN: AppManifest;
  ```
- Consumes from Plan 02 (`@invariance/theming/compile`):
  ```ts
  export type CandidateTheme = {
    light: Record<VarName, string>;
    dark?: Record<VarName, string>;
    meta: CandidateMeta;
  };
  ```
- Consumes from Task 1: `isSafeCssTokenValue(value: string): boolean`.
- Consumes from Task 2: `reparseToOklch(value: string, space: Space): Oklch | null`.
- Consumes from culori v4: `wcagContrast`.
- Produces (ledger §6, verbatim):
  ```ts
  export type Verdict =
    | { ok: true }
    | { ok: false; failures: VerifyFailure[] };

  export type VerifyFailure = {
    code: VerifyFailureCode;
    mode: Mode;
    pair?: ContrastPair;
    role?: RoleId;
    varName?: VarName;
    required?: number;
    actual?: number;
    message: string;
  };

  export type VerifyFailureCode =
    | "contrast_floor"
    | "locked_drift"
    | "chroma_cap"
    | "mode_not_allowed"
    | "unsafe_value";

  // THE GATE. Pure. Re-checks the FINAL serialized output; trusts nothing upstream.
  export function verify(theme: CandidateTheme, manifest: AppManifest): Verdict;
  ```

**Check semantics (verbatim §4.6, mapped to codes):**
1. **`mode_not_allowed`** — every mode present in the emitted theme (`light`, and `dark` if present) must be ∈ `manifest.modes.allowed`.
2. **`unsafe_value`** — `isSafeCssTokenValue` on *every* emitted value, in every emitted mode. Failure pins `role`/`varName`.
3. **`contrast_floor`** — for every `pair ∈ graph.contrastPairs`, in every mode that is **both emitted AND allowed**: re-parse the *emitted* `fg`/`bg` values (via `reparseToOklch`, mapping role→var→emitted string), compute `wcagContrast` on the re-parsed colors, require `≥ requiredContrast(tier, pair.category)`. A re-parse failure or contrast below floor is a `contrast_floor` failure (carrying `required`/`actual`). (An *allowed-but-unemitted* mode needs no per-theme contrast check: the applier falls back to the vendor's own base for that mode, and `refBasePassesTier` already gated base contrast at manifest time, §6. A mode that is *emitted-but-not-allowed* is caught by `mode_not_allowed` and its per-mode checks are skipped.)
4. **`locked_drift`** — for every lock entry that is a *derived output role* (∈ `graph.roles`, value-pinned), in every mode that is both emitted and allowed: the emitted var equals `base[mode][role]` re-serialized through that var's emit contract. Because both the candidate and base are emitted by the same compiler/format contract, the comparison is `emittedVar === expectedFromBase`, where `expectedFromBase` is the base value emitted the same way. We compare on the *emitted string* the compiler would write for base — i.e. the manifest already stores `base[mode][role]` in the emitted held form, so the comparison is direct string equality against `base[mode][role]`. Seed locks (frozen closures) are confirmed by the contrast + value re-checks, not a separate per-role pin.
5. **`chroma_cap`** — every re-parsed color's chroma `c ≤ manifest.invariants.chromaCap`, swept across every emitted value in every emitted-and-allowed mode.

> **Locked-var comparison rule (concrete):** the manifest's `base[mode][role]` is stored in the same held/emitted string form the compiler writes for an untouched role (the compiler writes locked roles "verbatim copying base", §4.5). So for a locked derived role, the verifier asserts `emittedValue === base[mode][role]` by string equality. The var↔role bridge is `manifest.variables`: find the `VarName` whose `.role === role`.

- [ ] **Step 1: Write the failing test** — FULL vitest code. (Uses small hand-built `CandidateTheme`s + a minimal manifest so the suite is self-contained and adversarial, per §8.)

```ts
// packages/theming/test/verify/verify.test.ts
import { describe, it, expect } from 'vitest';
import { verify } from '../../src/verify/index.js';
import type { AppManifest } from '../../src/manifest/index.js';
import type { CandidateTheme } from '../../src/compile/index.js';

// A minimal AA manifest: white background, black foreground (contrast ~21, well over AA text 4.5),
// one locked derived role (card pinned to white), chromaCap 0.4, modes light+dark allowed.
// Values are bare hsl triples (Shape:"triple", space:"hsl") to exercise the re-parse path.
const baseLight: Record<string, string> = {
  background: '0 0% 100%',
  foreground: '0 0% 0%',
  card: '0 0% 100%',
  'card-fg': '0 0% 0%',
  primary: '0 0% 0%',
  'primary-fg': '0 0% 100%',
  popover: '0 0% 100%',
  'popover-fg': '0 0% 0%',
  secondary: '0 0% 96%',
  'secondary-fg': '0 0% 0%',
  accent: '0 0% 96%',
  'accent-fg': '0 0% 0%',
  destructive: '0 60% 40%', // white-on-red ~ 7.22 (clears AA text 4.5 AND AAA text 7.0); chroma ~ 0.16 < cap
  'destructive-fg': '0 0% 100%',
  muted: '0 0% 96%',
  'muted-fg': '0 0% 40%',
  ring: '0 0% 0%',
};

function emitTriple(role: string): { shape: 'triple'; space: 'hsl'; precision: number } {
  return { shape: 'triple', space: 'hsl', precision: 3 };
}

const variables: AppManifest['variables'] = Object.fromEntries(
  Object.keys(baseLight).map((role) => [`--${role}`, { role, emit: emitTriple(role), confidence: 'confirmed' as const }]),
);

const manifest = {
  appId: 'test',
  manifestVersion: 1,
  vocabVersion: 'iv-roles-1',
  profileVersion: 'iv-profile-1',
  variables,
  modes: {
    allowed: ['light', 'dark'] as ('light' | 'dark')[],
    default: 'light' as const,
    selectors: { light: ':root', dark: '.dark' },
  },
  base: { light: baseLight, dark: baseLight },
  defaultSeeds: {
    colors: { primary: '0 0% 0%', accent: '0 0% 96%', neutral: '0 0% 100%', destructive: '0 60% 40%' },
    radius: 0.5,
    density: 'comfortable' as const,
  },
  invariants: {
    contrastTier: 'AA' as const,
    chromaCap: 0.4,
    locks: ['card'],
    allowedFonts: [{ id: 'sans', stack: 'ui-sans-serif, system-ui, sans-serif' }],
  },
} as unknown as AppManifest;

// Build a clean candidate that simply emits base verbatim into the var-keyed maps.
function cleanCandidate(): CandidateTheme {
  const toVars = (b: Record<string, string>) =>
    Object.fromEntries(Object.entries(b).map(([role, v]) => [`--${role}`, v]));
  return { light: toVars(baseLight), dark: toVars(baseLight), meta: { vocabVersion: 'iv-roles-1', profileVersion: 'iv-profile-1' } };
}

describe('verify (the gate)', () => {
  it('passes a clean candidate that emits base verbatim', () => {
    const v = verify(cleanCandidate(), manifest);
    expect(v.ok).toBe(true);
  });

  it('fails contrast_floor when a foreground is pushed just under the floor', () => {
    const c = cleanCandidate();
    // foreground -> mid-grey on white: re-parsed contrast ~ 3.98 < AA text 4.5 (verified via culori).
    c.light['--foreground'] = '0 0% 50%';
    const v = verify(c, manifest);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      const f = v.failures.find((x) => x.code === 'contrast_floor');
      expect(f).toBeDefined();
      expect(f!.mode).toBe('light');
      expect(f!.required).toBe(4.5);
      expect(f!.actual!).toBeLessThan(4.5);
      expect(f!.pair).toBeDefined();
    }
  });

  it('fails locked_drift when a locked var diverges from base', () => {
    const c = cleanCandidate();
    c.light['--card'] = '0 0% 90%'; // card is locked to '0 0% 100%'
    const v = verify(c, manifest);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      const f = v.failures.find((x) => x.code === 'locked_drift');
      expect(f).toBeDefined();
      expect(f!.role).toBe('card');
      expect(f!.varName).toBe('--card');
    }
  });

  it('fails chroma_cap when an emitted color exceeds the cap', () => {
    const c = cleanCandidate();
    // Inject a function-shaped oklch with chroma 0.45 > cap 0.4 directly into accent. reparseToOklch
    // passes a function-wrapped value through as-is (regardless of the var's emit.space), so the
    // re-parsed chroma is exactly 0.45 (verified via culori). The only contrast pair touching accent
    // is (accent-fg, accent); accent-fg stays black `0 0% 0%`, and black on oklch(0.7 0.45 30) is
    // ~6.28 (clears AA 4.5, verified via culori) — so the lone failure surfaced is chroma_cap.
    c.light['--accent'] = 'oklch(0.7 0.45 30)';
    const v = verify(c, manifest);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      const f = v.failures.find((x) => x.code === 'chroma_cap');
      expect(f).toBeDefined();
      expect(f!.varName).toBe('--accent');
      expect(f!.mode).toBe('light');
      expect(f!.required).toBe(0.4);
      expect(f!.actual!).toBeGreaterThan(0.4);
    }
  });

  it('fails mode_not_allowed when an emitted mode is not in manifest.modes.allowed', () => {
    const lightOnly = {
      ...manifest,
      modes: { ...manifest.modes, allowed: ['light'] as ('light' | 'dark')[] },
    } as unknown as AppManifest;
    const v = verify(cleanCandidate(), lightOnly); // candidate still emits dark
    expect(v.ok).toBe(false);
    if (!v.ok) {
      const f = v.failures.find((x) => x.code === 'mode_not_allowed');
      expect(f).toBeDefined();
      expect(f!.mode).toBe('dark');
    }
  });

  it('fails unsafe_value when an emitted value contains a CSS breakout', () => {
    const c = cleanCandidate();
    c.light['--foreground'] = '0 0% 0%; } body { display:none';
    const v = verify(c, manifest);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      const f = v.failures.find((x) => x.code === 'unsafe_value');
      expect(f).toBeDefined();
      expect(f!.varName).toBe('--foreground');
      expect(f!.mode).toBe('light');
    }
  });

  it('raises the floor to AAA when manifest tier is AAA', () => {
    const aaa = {
      ...manifest,
      invariants: { ...manifest.invariants, contrastTier: 'AAA' as const, locks: [] },
    } as unknown as AppManifest;
    const c = cleanCandidate();
    // grey 0 0% 35% on white: re-parsed contrast ~ 6.98 — passes AA (4.5) but fails AAA text (7.0)
    c.light['--foreground'] = '0 0% 35%';
    c.dark!['--foreground'] = '0 0% 35%';
    const v = verify(c, aaa);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      const f = v.failures.find((x) => x.code === 'contrast_floor');
      expect(f!.required).toBe(7);
    }
  });

  it('reports the failing mode for a dark-only contrast regression', () => {
    const c = cleanCandidate();
    c.dark!['--foreground'] = '0 0% 50%'; // only dark fails (re-parsed contrast ~ 3.98 < 4.5)
    const v = verify(c, manifest);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      const dark = v.failures.find((x) => x.code === 'contrast_floor' && x.mode === 'dark');
      const light = v.failures.find((x) => x.code === 'contrast_floor' && x.mode === 'light');
      expect(dark).toBeDefined();
      expect(light).toBeUndefined();
    }
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `pnpm -F @invariance/theming test -- verify`. Expected failure: `Failed to resolve import "../../src/verify/index.js"`.

- [ ] **Step 3: Minimal implementation** — FULL code for `verify.ts`, then `index.ts`, then the barrel edit.

`packages/theming/src/verify/verify.ts`:

```ts
// packages/theming/src/verify/verify.ts
import { wcagContrast } from 'culori';
import type { AppManifest } from '../manifest/index.js';
import type { CandidateTheme } from '../compile/index.js';
import type {
  Mode,
  RoleId,
  VarName,
  ContrastPair,
  ContrastTier,
  RoleGraph,
} from '../roles/index.js';
import { getRoleGraph, requiredContrast } from '../roles/index.js';
import { isSafeCssTokenValue } from './css-safe.js';
import { reparseToOklch } from './reparse.js';

export type VerifyFailureCode =
  | 'contrast_floor'
  | 'locked_drift'
  | 'chroma_cap'
  | 'mode_not_allowed'
  | 'unsafe_value';

export type VerifyFailure = {
  code: VerifyFailureCode;
  mode: Mode;
  pair?: ContrastPair;
  role?: RoleId;
  varName?: VarName;
  required?: number;
  actual?: number;
  message: string;
};

export type Verdict = { ok: true } | { ok: false; failures: VerifyFailure[] };

// Resolve role -> VarName via the manifest var↔role bridge (first var mapped to the role).
function varForRole(manifest: AppManifest, role: RoleId): VarName | null {
  for (const [varName, def] of Object.entries(manifest.variables)) {
    if (def.role === role) return varName;
  }
  return null;
}

function emitSpaceForVar(manifest: AppManifest, varName: VarName) {
  return manifest.variables[varName]?.emit.space ?? null;
}

// Compute WCAG contrast on the RE-PARSED emitted colors. Returns null if either is unparseable.
function contrastFromReparsed(
  manifest: AppManifest,
  fgVar: VarName,
  fgVal: string,
  bgVar: VarName,
  bgVal: string,
): number | null {
  const fg = reparseToOklch(fgVal, emitSpaceForVar(manifest, fgVar));
  const bg = reparseToOklch(bgVal, emitSpaceForVar(manifest, bgVar));
  if (!fg || !bg) return null;
  // wcagContrast accepts culori color objects; rebuild oklch objects with explicit mode.
  const fgC = { mode: 'oklch' as const, l: fg.l, c: fg.c, h: Number.isNaN(fg.h) ? 0 : fg.h };
  const bgC = { mode: 'oklch' as const, l: bg.l, c: bg.c, h: Number.isNaN(bg.h) ? 0 : bg.h };
  return wcagContrast(fgC, bgC);
}

function checkMode(
  manifest: AppManifest,
  graph: RoleGraph,
  tier: ContrastTier,
  mode: Mode,
  vars: Record<VarName, string>,
  failures: VerifyFailure[],
): void {
  const base = mode === 'light' ? manifest.base.light : manifest.base.dark ?? manifest.base.light;
  const locks = manifest.invariants.locks;
  const chromaCap = manifest.invariants.chromaCap;

  // (2) unsafe_value + (5) chroma_cap — sweep every emitted value once.
  for (const [varName, value] of Object.entries(vars)) {
    if (!isSafeCssTokenValue(value)) {
      failures.push({
        code: 'unsafe_value',
        mode,
        varName,
        role: manifest.variables[varName]?.role,
        message: `Value for ${varName} in ${mode} mode is not a safe CSS token value.`,
      });
      continue; // an unsafe value cannot be meaningfully re-parsed for chroma
    }
    const oklch = reparseToOklch(value, emitSpaceForVar(manifest, varName));
    if (oklch && oklch.c > chromaCap) {
      failures.push({
        code: 'chroma_cap',
        mode,
        varName,
        role: manifest.variables[varName]?.role,
        required: chromaCap,
        actual: oklch.c,
        message: `Color for ${varName} in ${mode} mode has chroma ${oklch.c.toFixed(3)} > cap ${chromaCap}.`,
      });
    }
  }

  // (3) contrast_floor — every contrastPair, on re-parsed emitted values.
  for (const pair of graph.contrastPairs) {
    const fgVar = varForRole(manifest, pair.fg);
    const bgVar = varForRole(manifest, pair.bg);
    if (!fgVar || !bgVar) continue; // unmapped pair → no obligation in this app
    const fgVal = vars[fgVar];
    const bgVal = vars[bgVar];
    if (fgVal == null || bgVal == null) continue;
    const required = requiredContrast(tier, pair.category);
    const actual = contrastFromReparsed(manifest, fgVar, fgVal, bgVar, bgVal);
    if (actual == null || actual < required) {
      failures.push({
        code: 'contrast_floor',
        mode,
        pair,
        required,
        actual: actual ?? 0,
        message: `Contrast ${pair.fg}/${pair.bg} in ${mode} mode is ${
          actual == null ? 'unparseable' : actual.toFixed(2)
        }, below the ${tier} ${pair.category} floor of ${required}.`,
      });
    }
  }

  // (4) locked_drift — derived-role locks pinned to base[mode][role] (string equality).
  for (const lock of locks) {
    // Only derived OUTPUT roles are pinned at the var level; seed-only locks freeze closures and
    // are confirmed by the contrast/chroma sweep above.
    if (!(lock in graph.roles)) continue;
    const varName = varForRole(manifest, lock);
    if (!varName) continue;
    const emitted = vars[varName];
    const expected = base[lock];
    if (emitted != null && expected != null && emitted !== expected) {
      failures.push({
        code: 'locked_drift',
        mode,
        role: lock,
        varName,
        message: `Locked role ${lock} (${varName}) in ${mode} mode emitted "${emitted}" but base pins "${expected}".`,
      });
    }
  }
}

// THE GATE. Pure. Re-checks the FINAL serialized output; trusts nothing upstream.
export function verify(theme: CandidateTheme, manifest: AppManifest): Verdict {
  const graph = getRoleGraph(manifest.vocabVersion);
  const tier = manifest.invariants.contrastTier;
  const allowed = manifest.modes.allowed;
  const failures: VerifyFailure[] = [];

  // (1) mode_not_allowed — every EMITTED mode must be allowed.
  const emittedModes: Mode[] = ['light'];
  if (theme.dark) emittedModes.push('dark');
  for (const mode of emittedModes) {
    if (!allowed.includes(mode)) {
      failures.push({
        code: 'mode_not_allowed',
        mode,
        message: `Theme emits ${mode} mode, which is not in manifest.modes.allowed.`,
      });
    }
  }

  // Per-mode checks run only for modes that are BOTH emitted and allowed.
  for (const mode of emittedModes) {
    if (!allowed.includes(mode)) continue;
    const vars = mode === 'light' ? theme.light : theme.dark!;
    checkMode(manifest, graph, tier, mode, vars, failures);
  }

  return failures.length === 0 ? { ok: true } : { ok: false, failures };
}
```

`packages/theming/src/verify/index.ts`:

```ts
// packages/theming/src/verify/index.ts
export { verify } from './verify.js';
export type { Verdict, VerifyFailure, VerifyFailureCode } from './verify.js';
export { isSafeCssTokenValue } from './css-safe.js';
```

Then add the barrel re-export to `packages/theming/src/index.ts` (place it alongside the other plane re-exports):

```ts
export * from './verify/index.js';
```

- [ ] **Step 4: Run tests, verify pass** — `pnpm -F @invariance/theming test -- verify`. Expected: PASS (all 8 `it` blocks green). Then run the full package suite to confirm no regression: `pnpm -F @invariance/theming test`. Expected: PASS.

- [ ] **Step 5: Commit** — `git add packages/theming/src/verify/verify.ts packages/theming/src/verify/index.ts packages/theming/src/index.ts packages/theming/test/verify/verify.test.ts && git commit -m "feat(theming): verify() — the gate (contrast/locks/chroma/modes/safety, re-parsed, pure) (Plan 03)"`

---

### Task 4: Adversarial hardening — re-parse-failure-as-contrast-floor and seed-lock-frozen-closure proofs

**Files:**
- Modify: `packages/theming/test/verify/verify.test.ts`

**Interfaces:**
- Consumes: `verify` (Task 3), `isSafeCssTokenValue` (Task 1) — no new production code; this task adds adversarial coverage the spec calls out (§4.6: "a gamut clamp that pushed a foreground under floor is caught here"; §3.1 seed-lock-frozen closure).

This task adds the remaining adversarial cases so the gate's guarantees are pinned by test, with no production change (proving the implementation already holds). If any assertion fails, fix `verify.ts` minimally to satisfy it before committing.

- [ ] **Step 1: Write the failing/confirming test** — append these `it` blocks inside the existing `describe('verify (the gate)', …)` in `packages/theming/test/verify/verify.test.ts`:

```ts
  it('treats a gamut-clamped foreground that re-parses under floor as contrast_floor', () => {
    // Simulate the compiler emitting a foreground whose RE-PARSED value (after a gamut clamp) is a
    // mid-grey that no longer clears the floor on white. The verifier must catch this on re-parse,
    // not trust an upstream "it passed" claim.
    const c = cleanCandidate();
    c.light['--foreground'] = '0 0% 50%'; // re-parsed ~3.98:1 on white < AA 4.5 (verified via culori)
    const v = verify(c, manifest);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      const f = v.failures.find((x) => x.code === 'contrast_floor' && x.mode === 'light');
      expect(f).toBeDefined();
      expect(f!.actual!).toBeLessThan(4.5);
    }
  });

  it('treats an unparseable foreground as contrast_floor (actual 0)', () => {
    const c = cleanCandidate();
    c.light['--foreground'] = 'definitely-not-a-color';
    const v = verify(c, manifest);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      const f = v.failures.find((x) => x.code === 'contrast_floor' && x.mode === 'light');
      expect(f).toBeDefined();
      expect(f!.actual).toBe(0);
    }
  });

  it('passes a seed-lock-frozen closure that emits base verbatim (no per-role pin needed)', () => {
    // Lock the seed-only 'neutral' (freezes the surface/line closure). The candidate emits base
    // verbatim, so contrast + chroma + safety all hold and there is NO locked_drift failure
    // (seed locks are confirmed by the sweep, not a per-role pin).
    const seedLocked = {
      ...manifest,
      invariants: { ...manifest.invariants, locks: ['neutral'] },
    } as unknown as AppManifest;
    const v = verify(cleanCandidate(), seedLocked);
    expect(v.ok).toBe(true);
  });

  it('accumulates multiple distinct failures in a single verdict', () => {
    const c = cleanCandidate();
    c.light['--foreground'] = '0 0% 50%'; // contrast_floor
    c.light['--card'] = '0 0% 80%'; // locked_drift (card is locked)
    const v = verify(c, manifest);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      const codes = new Set(v.failures.map((f) => f.code));
      expect(codes.has('contrast_floor')).toBe(true);
      expect(codes.has('locked_drift')).toBe(true);
    }
  });

  it('every failure carries a non-empty deterministic message', () => {
    const c = cleanCandidate();
    c.light['--foreground'] = '0 0% 50%';
    const v = verify(c, manifest);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      for (const f of v.failures) {
        expect(typeof f.message).toBe('string');
        expect(f.message.length).toBeGreaterThan(0);
      }
    }
  });

  it('is pure: same inputs -> identical verdict across repeated calls', () => {
    const c = cleanCandidate();
    c.light['--foreground'] = '0 0% 50%';
    const a = verify(c, manifest);
    const b = verify(c, manifest);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
```

- [ ] **Step 2: Run it, verify status** — `pnpm -F @invariance/theming test -- verify`. Expected: the new blocks PASS (the implementation from Task 3 already satisfies them). If any fails, that is a real gap in `verify.ts` — fix it minimally (e.g. ensure unparseable contrast yields `actual: 0` and a `contrast_floor` failure) and re-run until green.

- [ ] **Step 3: (Only if Step 2 surfaced a gap) Minimal fix** — if the "unparseable foreground" case did not produce `actual: 0`, confirm `contrastFromReparsed` returns `null` and the `contrast_floor` push uses `actual: actual ?? 0`. The Task 3 code already does this; no change expected. If a real divergence appears, edit `packages/theming/src/verify/verify.ts` to make the failing assertion pass, showing the exact replaced lines in the commit.

- [ ] **Step 4: Run tests, verify pass** — `pnpm -F @invariance/theming test -- verify`. Expected: PASS (all blocks, original + appended). Then `pnpm -F @invariance/theming test`. Expected: PASS.

- [ ] **Step 5: Commit** — `git add packages/theming/test/verify/verify.test.ts packages/theming/src/verify/verify.ts && git commit -m "test(theming): adversarial verifier suite — re-parse-as-floor, seed-lock closure, multi-failure, purity (Plan 03)"`

---
