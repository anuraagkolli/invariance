# Theming Pipeline — Shared Interface Ledger (Plan 00)

**Date:** 2026-06-18
**Source of truth:** `docs/superpowers/specs/2026-06-17-governed-theming-pipeline-design.md`
**Status:** Canonical cross-plan naming truth. The 7 plan authors MUST use byte-identical
type/function names and module homes from this document. If a plan needs a name not here, that is a
gap to escalate — do not invent a divergent name.

> **How to read this:** every contract that crosses a plan/module boundary appears once, with its
> canonical TypeScript definition and its module home (import path). Concrete domain detail (the 27
> roles, derivations, contrastPairs, f-table, emit Shape/Space members) is copied verbatim from the
> spec. Plan numbers map to spec sections per the suite charter:
>
> | Plan | Name | Spec sections |
> |---|---|---|
> | 01 | Determinism Core | §3, §6, §4.1, §4.2, §4.3 |
> | 02 | Compiler + Ramp Profile | §3.1 (consumed), §4.5, §12 |
> | 03 | Verifier | §4.6 |
> | 04 | Artifact + Applier + Pointer | §7 |
> | 05 | Publish + Storage + Session | §9, §4.4, §8 |
> | 06 | Scan Contract + Scanner | §5, §1.1 |
> | 07 | LLM Stages + Next.js Delivery | §1.2, §1.3 |

---

## 0. Package & module map (import-path truth)

```
packages/theming/   (@invariance/theming)  — pure, plane-agnostic deterministic core
  src/roles/index.ts        → @invariance/theming/roles      (Plan 01)
  src/manifest/index.ts     → @invariance/theming/manifest   (Plan 01)
  src/spec/index.ts         → @invariance/theming/spec       (Plan 01)
  src/session/index.ts      → @invariance/theming/session    (Plan 01)
  src/profile/index.ts      → @invariance/theming/profile    (Plan 02)
  src/compile/index.ts      → @invariance/theming/compile     (Plan 02)
  src/verify/index.ts       → @invariance/theming/verify      (Plan 03)
  src/artifact/index.ts     → @invariance/theming/artifact    (Plan 04)
  src/index.ts              → @invariance/theming             (barrel re-export of all of the above)

apps/control-plane/src/theming/
  scan/        Scanner: ScanPayload -> AppManifest, coverage report   (Plan 06)
  publish/     storage interfaces, publisher, version retention       (Plan 05)
  authoring/   session orchestration, MockAgent, gatekeeper, designer (Plan 05 mock; Plan 07 real)

packages/client/src/theming/
  scan-sdk/    in-browser scan (CSSOM two-pass + getComputedStyle)    (Plan 06)
  applier re-exports renderStyleText/applyTheme from @invariance/theming (Plan 04)

apps/<host>/   data-plane Next.js adapter (SSR styleTag + pointer fetch) (Plan 07)
```

**Convention (from CLAUDE.md):** zod schema first; export both `XSchema` and
`type X = z.infer<typeof XSchema>`. Workspace packages export TS source directly. ESM.
Canonical JSON = sorted keys.

---

## 1. Shared primitive type aliases (module home: `@invariance/theming/roles`)

These are referenced by nearly every plan. They live in `roles/` and are re-exported from the barrel.

```ts
// Branded-ish string aliases. v1 keeps them plain string for ergonomics; the zod schemas enforce
// membership against the live RoleGraph / manifest where it matters.
export type SeedId = string;   // ∈ RoleGraph.seeds — "primary" | "accent" | "neutral" | "destructive" | "radius" | "density" | "mode" | "display" | "body" | "mono"
export type RoleId = string;   // ∈ keys of RoleGraph.roles (the 27 output roles in iv-roles-1)
export type StepId = string;   // ramp step identifier consumed by surface-step/line-step/offset derivations
export type VarName = string;  // a CSS custom property name including leading "--", e.g. "--background"

export type Kind = "color" | "dimension" | "typography";

export type Mode = "light" | "dark";              // a RESOLVED mode (apply-time, artifact, base)
export type SpecMode = "light" | "dark" | "both"; // the StyleSpec/compile-time mode axis ("both" is compile-only)

export type ContrastCategory = "text" | "large-text" | "ui";
export type ContrastTier = "AA" | "AAA";
export type FontStackId = string; // an index/key into manifest.invariants.allowedFonts — NEVER free text
```

> **Naming discipline:** use `Mode` for resolved light/dark everywhere downstream of the wall
> (artifact, applier, base, compile output). Use `SpecMode` only for the StyleSpec `mode` leaf and
> compile-time intent. Do not introduce `"system"` as a type member — it is resolved to a concrete
> `Mode` before SSR (§7.2) and never reaches these contracts.

---

## 2. Role graph — `@invariance/theming/roles`  (Plan 01; consumed by 02, 03)

### 2.1 Vocab version constant

```ts
export const VOCAB_VERSION = "iv-roles-1" as const;
```

### 2.2 Derivation — the FULL discriminated union (verbatim from §3)

```ts
export type Derivation =
  | { kind: "seed";           seed: SeedId }                                  // role IS a seed (primary, accent, destructive, radius)
  | { kind: "surface-anchor"; seed: "neutral" }                              // background — the mode-dependent base surface
  | { kind: "surface-step";   seed: "neutral"; step: StepId }                // card, popover, muted, secondary
  | { kind: "line-step";      seed: "neutral"; step: StepId }                // border, input
  | { kind: "foreground-of";  bg: RoleId; strategy: "maximize-contrast" | "minimum-legible" }
  | { kind: "accent-line";    seed: SeedId }                                  // ring
  | { kind: "offset";         seed: "radius"; step: StepId }                  // radius-sm/md/lg/xl
  | { kind: "pick";           axis: "display" | "body" | "mono" };
```

### 2.3 ContrastPair and RoleGraph (verbatim from §3)

```ts
export type ContrastPair = { fg: RoleId; bg: RoleId; category: ContrastCategory };

export type RoleGraph = {
  seeds: SeedId[];                                  // StyleSpec INPUT axes — small
  roles: Record<RoleId, { kind: Kind; derivation: Derivation }>;
  contrastPairs: ContrastPair[];
};
```

### 2.4 The `iv-roles-1` instance — exported value

```ts
export const ivRoles1: RoleGraph;        // the concrete graph instance (the table below, materialized)
export function getRoleGraph(vocabVersion: string): RoleGraph;  // lookup by version; throws on unknown (retention §9)
```

**`seeds`** (verbatim §3): `primary, accent, neutral, destructive, radius, density, mode` + the three
typography picks (`display, body, mono`). `neutral` is **seed-only** (no `--neutral` var). `density`
is a **present-but-empty** seed in `iv-roles-1` (input axis, zero output roles).

**`roles` — the v1 shadcn instance (27 core roles)** (verbatim §3 table):

| Group | Roles | Derivation |
|---|---|---|
| Brand seeds | `primary`, `accent`, `destructive` | `seed` |
| Surfaces | `background` | `surface-anchor(neutral)` |
| | `card`, `popover`, `muted`, `secondary` | `surface-step(neutral)` |
| Lines | `border`, `input` | `line-step(neutral)` |
| Focus | `ring` | `accent-line(primary)` |
| Foregrounds | `foreground`, `card-fg`, `popover-fg`, `secondary-fg`, `primary-fg`, `accent-fg`, `destructive-fg` | `foreground-of(<bg>, "maximize-contrast")` |
| | `muted-fg` | `foreground-of(muted, "minimum-legible")` |
| Dimension | `radius` | `seed` · `radius-sm/md/lg/xl` → `offset(radius)` |
| Typography | `font-display`, `font-body`, `font-mono` | `pick(axis)` |

**Foreground-of `bg` bindings** (the `<bg>` resolved from the group above):
`foreground → background`, `card-fg → card`, `popover-fg → popover`, `secondary-fg → secondary`,
`primary-fg → primary`, `accent-fg → accent`, `destructive-fg → destructive`,
`muted-fg → muted` (strategy `minimum-legible`; all others `maximize-contrast`).

`chart-1..5` and `sidebar-*` are **deferred** to a later vocab (§3, §10).

**`contrastPairs` — verbatim from §3** (the verifier's check set / compiler's repair set):

- `text`: `(foreground,background)`, `(card-fg,card)`, `(popover-fg,popover)`, `(primary-fg,primary)`,
  `(secondary-fg,secondary)`, `(accent-fg,accent)`, `(destructive-fg,destructive)`
- `large-text`: `(muted-fg, muted)`
- `ui`: `(ring, background)`, `(ring, card)`, `(ring, popover)`
- **`border` and `input` are intentionally NOT checked** (decorative; see §3).

### 2.5 The three graph laws (encoded as consumed by Plan 02/03 — see §3.1)

1. **Mode-polarization keyed on `kind`:** `kind:"color"` derivations are mode-polarized;
   `dimension`/`typography` are mode-stable. The ramp profile is mode-indexed.
2. **Repair direction:** the `fg` member of a failing pair moves (its L), the `bg` member holds,
   seeds are fixed points (never an `fg`).
3. **Foreground search:** `maximize-contrast` runs to the contrast-increasing extreme;
   `minimum-legible` stops at the first step clearing the floor. Same monotonic search, different
   stop rule.

### 2.6 The `f(tier, category)` function — signature + exact ratio table (verbatim §6)

```ts
export function requiredContrast(tier: ContrastTier, category: ContrastCategory): number;
```

| | `text` | `large-text` | `ui` |
|---|---|---|---|
| **AA** | 4.5 | 3.0 | 3.0 |
| **AAA** | 7.0 | 4.5 | 3.0 |

(`ui` stays 3.0 at AAA — WCAG does not raise non-text contrast.)

> **Canonical name is `requiredContrast`.** Some prose calls it `f(tier, category)`; the exported
> identifier all plans import is `requiredContrast`.

---

## 3. StyleSpec / OklchColor / fonts — `@invariance/theming/spec`  (Plan 01; consumed by 02, 05, 07)

### 3.1 Shared numeric constants

```ts
export const MAX_RADIUS_PX = 24;   // upper clamp for the radius leaf; exact value is a profile/eyes-on knob (§12) but pinned here so the schema is stable
```

> `MAX_RADIUS_PX` is the schema's compile-time upper bound. Plan 01 owns the canonical value; Plan 02
> may tighten emitted radius via the profile but never relaxes this schema bound.

### 3.2 OklchColor — parsed form `{ l, c, h }` and the null sentinel (verbatim §4.1)

`OklchColor` is **parse-don't-validate**: the input string is parsed to OKLCH and clamped to the
chroma cap on the way in. The **parsed/typed form** that flows downstream:

```ts
export type Oklch = { l: number; c: number; h: number };
//  l ∈ [0,1] lightness, c ≥ 0 chroma (clamped to manifest chromaCap), h ∈ [0,360) hue (NaN allowed for achromatic)

// The zod schema for a single color leaf: accepts a CSS color string, parses to Oklch, clamps chroma.
// Output type of the schema is Oklch (NOT the raw string).
export const OklchColor: z.ZodType<Oklch /*, in: string */>;
```

- An unparseable value or a smuggled CSS breakout **fails to parse** → the turn is rejected.
- The dangerous string never advances past the wall.

### 3.3 FontStackId leaf

```ts
export const FontStackId: z.ZodType<FontStackId>;  // validates string; semantic check (∈ manifest.allowedFonts) happens in parseSpec via manifest context
```

### 3.4 The StyleSpec schema (verbatim §4.1)

```ts
// Parses BOTH deltas and drafts. Leaves are .optional().nullable():
//   undefined = "not in this delta" (absent);  null = the removal sentinel ("revert to app default").
// The merge normalizes null out, so a DRAFT is always null-free. The sentinel is leaf-only —
// group objects are .optional() but NOT nullable.
export const StyleSpec = z.object({
  colors: z.object({
    primary:     OklchColor.optional().nullable(),
    accent:      OklchColor.optional().nullable(),
    neutral:     OklchColor.optional().nullable(),   // seeds the surface/line ramp; not an output var
    destructive: OklchColor.optional().nullable(),
  }).strict().optional(),
  radius:  z.number().min(0).max(MAX_RADIUS_PX).optional().nullable(),
  density: z.enum(["compact", "comfortable", "spacious"]).optional().nullable(),
  typography: z.object({
    display: FontStackId.optional().nullable(),      // index into manifest.allowedFonts — NEVER free text
    body:    FontStackId.optional().nullable(),
    mono:    FontStackId.optional().nullable(),
  }).strict().optional(),
  mode: z.enum(["light", "dark", "both"]).optional().nullable(),
}).strict();

export type StyleSpec = z.infer<typeof StyleSpec>;
```

> **Note on the type name:** `StyleSpec` is BOTH the zod schema value and the inferred type (they
> share the name; TS allows a value and a type to coexist). Plans import the value for parsing and
> the type for signatures. This matches the spec's own usage.

### 3.5 parseSpec — the wall entry (signature + behavior)

```ts
// THE WALL. Parse-don't-validate against the closed schema, WITH manifest context for the two
// manifest-dependent checks: font allowlist membership and seed-lock projection.
export function parseSpec(json: unknown, manifest: AppManifest): ParseResult;

export type ParseResult =
  | { ok: true;  spec: StyleSpec }                       // a parsed, typed spec (delta OR draft)
  | { ok: false; failures: WallFailure[] };              // rejection — turn rejected, draft untouched

export type WallFailure = {
  code: WallFailureCode;
  path: string;          // dotted path to the offending field, e.g. "colors.primary"
  message: string;       // deterministic, template-able
};

export type WallFailureCode =
  | "unknown_key"          // closed-schema violation
  | "unparseable_color"    // OklchColor failed to parse (incl. CSS breakout attempt)
  | "font_not_allowed"     // FontStackId ∉ manifest.allowedFonts
  | "seed_locked"          // delta sets a seed that is locked (lock projection at the wall, §3.1/§4.1)
  | "out_of_range"         // radius/enum out of bounds
  | "schema_invalid";      // any other zod failure
```

**Lock projection at parse time (§4.1):** a **seed lock** (any `SeedId`, including seed-only
`neutral`) → `parseSpec` rejects a delta that sets that seed (`code: "seed_locked"`). A
**derived-role lock** is **never** rejected at the wall (handled by the compiler).

### 3.6 mergeDelta / canonicalize / diffSpecs — module home: `@invariance/theming/session` (Plan 01)

> These live under `session/` per the package layout (`src/session/ mergeDelta, canonicalize,
> diffSpecs, session state machine`). They consume `StyleSpec` from `spec/`.

```ts
// §4.2 — fold a parsed sparse delta onto the current draft. Structural (recurses one level into
// colors/typography), applies the null sentinel as delete, then canonicalizes. Output is null-free.
export function mergeDelta(draft: StyleSpec, delta: StyleSpec): StyleSpec;

// §4.2 — total canonicalization: remove empty groups (colors:{} ⇒ colors absent), so a draft has
// EXACTLY ONE representation. Run after every merge. Makes "draft == appDefault?" structural equality.
export function canonicalize(spec: StyleSpec): StyleSpec;

// §4.3 — three-state diff over the closed role set. BOTH operands are full, parsed, post-merge drafts.
// Resolves color values via the manifest/compiler so "from"/"to" are RESOLVED values, not raw strings.
// No-op fields emit nothing. Sentinel-revert surfaces as kind:"removed" with to = app-default resolved value.
export function diffSpecs(prev: StyleSpec, next: StyleSpec, manifest: AppManifest): FieldDiff[];

export type FieldDiff = {
  role: RoleId | SeedId;                  // the touched field (seed for colors/radius/density, or role-keyed)
  from: string | null;                    // resolved prior value (null when kind === "added")
  to: string | null;                      // resolved next value (null when kind === "removed")
  kind: "added" | "changed" | "removed";
};
```

> **Empty-diff signal:** `diffSpecs` returning `[]` is the canonical "No visual change from that"
> case (§4.4). The session layer (Plan 05) keys its empty-diff render off `length === 0`.

---

## 4. Manifest — `@invariance/theming/manifest`  (Plan 01; consumed by ALL)

### 4.1 Shape / Space (verbatim §6, the emit struct)

```ts
export type Shape = "triple" | "function" | "raw" | "number";
export type Space = "hsl" | "rgb" | "oklch" | null;

export type EmitContract = { shape: Shape; space: Space; precision: number };  // the format contract (§5)
```

> `Space` includes the literal `null` member (not `"null"`). `raw`/`number` shapes require
> `space: null`; `triple`/`function` require a non-null space (superRefine, §4.5 below).

### 4.2 AppManifest (verbatim §6)

```ts
export const AppManifest = z.object({
  appId: z.string(),
  manifestVersion: z.number(),
  vocabVersion: z.string(),     // pins the role graph — "iv-roles-1"
  profileVersion: z.string(),   // pins the ramp profile

  variables: z.record(VarName, z.object({          // the var↔role bridge — core onboarding output
    role: z.string(),                                // RoleId ∈ the pinned vocab's roles
    emit: z.object({ shape: ShapeSchema, space: SpaceSchema, precision: z.number() }),  // format contract (§5)
    confidence: z.enum(["confirmed", "inferred"]),
  })),

  modes: z.object({
    allowed: z.array(z.enum(["light", "dark"])),     // invariant: emitted modes ⊆ allowed
    default: z.enum(["light", "dark"]),               // cold-start fallback (∈ allowed)
    selectors: z.object({ light: z.string(), dark: z.string().optional() }),  // one selector per mode
  }),

  base: z.object({
    light: z.record(z.string() /*RoleId*/, z.string()),
    dark:  z.record(z.string() /*RoleId*/, z.string()).optional(),
  }),  // verbatim — fail-open, locked-role pins, untouched-role fallback

  defaultSeeds: z.object({
    colors: z.object({ primary: z.string(), accent: z.string(), neutral: z.string(), destructive: z.string() }),
    radius: z.number(),
    density: z.enum(["compact", "comfortable", "spacious"]),
  }),  // Designer delta baseline

  invariants: z.object({
    contrastTier: z.enum(["AA", "AAA"]),              // → f(tier, pair.category)
    chromaCap: z.number(),
    locks: z.array(z.string()),                        // (SeedId | RoleId)[]: seed-lock ⇒ wall-reject re-seed; derived-role lock ⇒ pin to base[mode][role]
    allowedFonts: z.array(z.object({ id: z.string() /*FontStackId*/, stack: z.string() })),
  }),
}).superRefine(/* §4.3 checks below */);

export type AppManifest = z.infer<typeof AppManifest>;
```

### 4.3 The superRefine checks — NAMED (verbatim §6)

The manifest's first verification layer. Plan 01 implements all of these in the `superRefine` block.
Authors across plans reference them by these names:

- **`refRolesInVocab`** — `variables[*].role` and `locks[*]` ∈ the pinned vocab's role set.
- **`refModesWellFormed`** — `modes.default ∈ modes.allowed ⊆ {light,dark}`.
- **`refDefaultSeedsComplete`** — `defaultSeeds` covers every seed.
- **`refFontsPresentIfTypographyMapped`** — `allowedFonts` non-empty if any typography role is mapped.
- **`refEmitSpaceConsistent`** — `emit.space` consistent with `emit.shape` (`triple`/`function`
  require non-null space; `raw`/`number` require null space).
- **`refBasePassesTier`** — *the §3 gate, formalized and blocking:* ∀ `pair ∈ graph.contrastPairs`,
  ∀ `mode ∈ allowed`, `ratio(base[mode][pair.fg], base[mode][pair.bg]) ≥ requiredContrast(tier, pair.category)`.
  A vendor whose base fails the declared tier **cannot publish the manifest**.
- **`refLocksResolveAndPinnable`** — every `locks` entry is either a `SeedId ∈ vocab.seeds` (seed
  lock) or a derived output role; for each derived-role lock, ∀ `mode ∈ allowed`, `base[mode][role]`
  exists (else dangling pin). Seed locks need no per-role base entry.
- **`refPerModeSelectorPresent`** — every allowed mode has its selector recorded (a manifest allowing
  `dark` with no dark selector fails here, not at first paint).

### 4.4 The shadcn "can" fixture

```ts
export const SHADCN_CAN: AppManifest;   // the prebuilt manifest for the near-zero-touch shadcn path (§1.1, §5)
// module home: packages/theming/src/manifest/shadcn-can.ts, re-exported from manifest/index.ts
```

> The "can" base **meets AA** (so `refBasePassesTier` passes) and uses **no `color-mix`** (so the
> scan path never rides on general CSSOM inference). Plan 06 (Scanner) emits a manifest of this same
> shape; Plan 05/02/03 golden-file against `SHADCN_CAN`.

---

## 5. Compiler + Ramp Profile — `@invariance/theming/compile` & `/profile`  (Plan 02)

### 5.1 Ramp profile — `@invariance/theming/profile`

```ts
export const PROFILE_VERSION = "iv-profile-1" as const;   // pins the ramp profile (matches AppManifest.profileVersion)

// Per-mode numbers (§3.1 law 1: mode-indexed). Concrete L-ladders / step magnitudes / seed nudges /
// radius offsets are eyes-on / golden-filed (§12) — the SHAPE is fixed here, the values iterate.
export type ModeProfile = {
  anchorL: number;                              // surface-anchor base L for this mode
  surfaceSteps: Record<StepId, number>;          // signed L deltas for surface-step roles
  lineSteps: Record<StepId, number>;             // signed L deltas for line-step roles
  seedNudge?: Partial<Record<SeedId, { l?: number; c?: number; h?: number }>>;  // per-mode seed adjustment (dark lift/desaturate)
  foregroundStep: number;                        // monotonic L step size for the foreground search (§3.1 law 3)
};

export type RampProfile = {
  profileVersion: string;
  light: ModeProfile;
  dark: ModeProfile;
  radiusOffsets: Record<StepId, number>;         // offset(radius) deltas — mode-stable (§3.1 law 1)
};

export const ivProfile1: RampProfile;
export function getRampProfile(profileVersion: string): RampProfile;  // lookup; throws on unknown (retention §9)
```

### 5.2 CandidateTheme + compile signature (verbatim §4.5)

```ts
export type CandidateTheme = {
  light: Record<VarName, string>;
  dark?: Record<VarName, string>;
  meta: CandidateMeta;
};

export type CandidateMeta = {
  vocabVersion: string;
  profileVersion: string;
  // additional eyes-on / debugging fields permitted; applier and verifier do not depend on them
};

// Pure: same inputs → byte-identical output. No Date.now()/Math.random()/I/O.
export function compile(draft: StyleSpec, manifest: AppManifest): CandidateTheme;
```

**Compile jobs, in order (verbatim §4.5):**
1. **Expand** the affected closure → tokens (magnitudes from the profile). `base` is the canvas;
   emit `base[mode][role]` verbatim unless the role's derivation **transitively** depends on a seed
   present in the draft, in which case re-derive (topological walk over the affected closure).
2. **Contrast repair** per §3.1 law 2/3: `fg` moves, `bg` holds, seeds fixed; `minimum-legible` stops
   at floor, `maximize-contrast` runs to the extreme. `ring` is the lone multi-pair repair.
   **Root-pair hard-reject:** if `(foreground, background)` cannot clear with `foreground` at the
   extreme → candidate fails the gate. Repair may only *raise* contrast.
3. **Generate dark separately** (two independent ladders).
4. **Map + serialize per the format contract** — OKLCH → `emit.space` with gamut-map on convert,
   serialize `emit.shape` at fixed `emit.precision`. **Locked roles written last, copying base
   verbatim.**

> The compiler produces a `CandidateTheme` even when a contrast repair fails to converge; whether the
> candidate "fails the gate" is the **verifier's** verdict (§4.6). The compiler does not throw on
> root-pair failure — it emits the best-effort serialized output for the verifier to reject. (This
> keeps the gate authoritative; the compiler never silently accepts.)

---

## 6. Verifier — `@invariance/theming/verify`  (Plan 03)

### 6.1 Verdict + structured failure shape + failure codes (verbatim §4.6)

```ts
export type Verdict =
  | { ok: true }
  | { ok: false; failures: VerifyFailure[] };

export type VerifyFailure = {
  code: VerifyFailureCode;
  mode: Mode;                       // which resolved mode the failure was found in
  // populated per-code:
  pair?: ContrastPair;              // for contrast_floor
  role?: RoleId;                    // for locked_drift / chroma_cap / unsafe_value
  varName?: VarName;                // the emitted variable implicated
  required?: number;                // for contrast_floor: the floor from requiredContrast
  actual?: number;                  // for contrast_floor: the measured ratio
  message: string;                  // deterministic, template-keyed (failure-UX, §1.2)
};

export type VerifyFailureCode =
  | "contrast_floor"        // contrast < f(tier, pair.category) for a pair in an allowed mode
  | "locked_drift"          // a locked variable ≠ emit(base[mode][role])
  | "chroma_cap"            // a color exceeds the chroma cap
  | "mode_not_allowed"      // an emitted mode ∉ manifest.modes.allowed
  | "unsafe_value";         // isSafeCssTokenValue failed (parse-then-reserialize)
```

### 6.2 verify signature

```ts
// THE GATE. Pure. Re-checks the FINAL serialized output; trusts nothing upstream (not the LLM,
// not the compiler). Re-parses every emitted string.
export function verify(theme: CandidateTheme, manifest: AppManifest): Verdict;
```

Independently confirms (verbatim §4.6):
- contrast ≥ `requiredContrast(tier, pair.category)` for every `contrastPair`, in every allowed mode;
- every locked variable equals its base — precisely `emit(base[mode][role]) == emittedVar`;
- no color exceeds the chroma cap;
- emitted modes ⊆ `manifest.modes.allowed`;
- `isSafeCssTokenValue` on every value.

### 6.3 isSafeCssTokenValue (verbatim §4.6)

```ts
// Implemented as PARSE-THEN-RESERIALIZE, not a regex — a string containing a CSS breakout
// structurally cannot pass. Module home: @invariance/theming/verify (re-exported from barrel).
export function isSafeCssTokenValue(value: string): boolean;
```

> `isSafeCssTokenValue` is exported standalone because the applier (Plan 04) calls it at apply-time
> as the final fail-open guard (§1.3, §7.2: "unsafe value → inject nothing").

---

## 7. Artifact + Applier + Pointer — `@invariance/theming/artifact`  (Plan 04)

### 7.1 ThemeArtifact (verbatim §7.1)

```ts
export const ThemeArtifact = z.object({
  schemaVersion: z.number(),
  vocabVersion: z.string(),
  profileVersion: z.string(),
  appId: z.string(),               // NO tenant — pure value keyed by its own content
  modes: z.object({
    light: z.object({ selector: z.string(), vars: z.record(VarName, z.string()) }),
    dark:  z.object({ selector: z.string(), vars: z.record(VarName, z.string()) }).optional(),
  }),
  meta: z.object({                  // applier IGNORES meta
    verifierReport: z.unknown(),
    contrastFloor: z.unknown(),
    chromaCap: z.number(),
  }).passthrough(),
});

export type ThemeArtifact = z.infer<typeof ThemeArtifact>;

// hash = content-address over canonical JSON (excluding the hash field itself)
export function hashArtifact(artifact: ThemeArtifact): string;       // canonical-JSON content address
export function buildArtifact(theme: CandidateTheme, manifest: AppManifest, verdict: Verdict): ThemeArtifact;
```

> **No `tenant` in the artifact** — the tenant→hash binding is the **pointer's** job (§7.1). Plan 04
> owns `buildArtifact` (compile output → artifact) and `hashArtifact`; Plan 05 (publisher) calls
> both.

### 7.2 The applier — one pure core, two sinks (verbatim §7.2)

```ts
// PURE renderer (golden-filed). `${modes[mode].selector} { --x: val; … }`
export function renderStyleText(artifact: ThemeArtifact, mode: Mode): string;

// SERVER sink — returns a "<style nonce=…>…</style>" string to inline. Nonce is HANDED in.
export function styleTag(artifact: ThemeArtifact, mode: Mode, opts: { nonce: string }): string;

// CLIENT sink — injects <style nonce> at the END of <head>. Nonce is DISCOVERED.
export function applyTheme(artifact: ThemeArtifact, mode: Mode, opts: { doc: Document }): void;
```

**Cascade-win / nonce / cold-start / resolved-mode invariants (verbatim §7.2):**
- Dark vars emit under the app's own dark selector (`modes.dark.selector`) for specificity parity;
  the `<style>` is appended at the **end of `<head>`** so source-order breaks the tie.
- Apply-time `mode` is exactly `"light" | "dark"` (the `Mode` type). `"both"` is a compile concept;
  `"system"` is resolved to a concrete `Mode` **before** SSR.
- **Cold-start:** server renders the tenant theme in `manifest.modes.default`; client bootstrap reads
  `prefers-color-scheme` and switches+persists if it differs.
- **Nonce:** `styleTag` is handed the server-minted nonce; `applyTheme` discovers it via
  `doc.querySelector('style[nonce],script[nonce]')?.nonce` (the `.nonce` IDL property). No trusted
  element found **and** CSP enforced → inject nothing = **fail open**.
- `applyTheme` calls `isSafeCssTokenValue` (Plan 03) on every value before injecting; any unsafe
  value → inject nothing (fail open, §1.3).

### 7.3 Pointer (verbatim §7.3)

```ts
export const Pointer = z.object({
  hash: z.string(),
  status: z.enum(["live", "disabled"]),
  updatedAt: z.string(),                 // ISO timestamp
});  // KV: tenant → Pointer

export type Pointer = z.infer<typeof Pointer>;
```

> URL is derived from `cdnBase` (app config) + `hash`. Publish and kill-switch are **both a pointer
> write**. A **pointer miss** (no key) and `status:"disabled"` both resolve to base but are **distinct
> telemetry events** (Plan 07 delivery adapter distinguishes them).

---

## 8. Scan contract + Scanner — `apps/control-plane/src/theming/scan/` & `packages/client/src/theming/scan-sdk/`  (Plan 06)

### 8.1 ScanPayload — full (verbatim §5). Module home: `@invariance/theming` (shared so both planes parse it)

> ScanPayload is a **shared contract** — produced by the client `scan-sdk` (Plan 06, browser) and
> consumed by the control-plane `Scanner` (Plan 06). Its schema lives in `packages/theming` (proposed
> home `src/scan/scan-payload.ts`, re-exported from the barrel) so both sides import the same zod
> schema. Plan 06 owns it.

```ts
export const ScanPayload = z.object({
  scanVersion: z.number(),
  origin: z.string(),
  variables: z.array(z.object({
    name: z.string(),                                   // VarName
    declarations: z.array(z.object({
      selector: z.string(),                             // ":root" | ".dark" | "[data-theme='dark']" | …
      mode: z.enum(["light", "dark", "unknown"]),       // inferred from selector
      rawValue: z.string(),                             // held / as-authored, e.g. "0 0% 100%"
      heldFormat: z.enum(["hsl-triple", "rgb-triple", "hex", "oklch", "number", "keyword", "unknown"]),
    })),
  })),
  consumption: z.record(z.string() /*VarName*/, z.array(z.object({
    wrapping: z.enum(["hsl", "rgb", "oklch", "raw", "color-mix", "other"]),  // hsl(var(--x)) vs raw var(--x) vs …
    selector: z.string(),
    property: z.string(),
  }))),
  opaqueSheets: z.array(z.string()),                    // cross-origin sheets that threw SecurityError on .cssRules
});

export type ScanPayload = z.infer<typeof ScanPayload>;
```

### 8.2 The in-browser scan entry — `packages/client/src/theming/scan-sdk/`

```ts
// CSSOM two-pass (source of truth) + getComputedStyle (active-mode cross-check + var-chain resolver).
export function scan(doc?: Document): ScanPayload;
```

### 8.3 The Scanner entry — `apps/control-plane/src/theming/scan/`

```ts
// Consumes a ScanPayload, classifies each --* var into a role (OKLCH classification against the role
// graph), infers the format contract, produces a coverage report and (on vendor confirmation) the
// per-app AppManifest.
export function runScanner(payload: ScanPayload, opts: ScannerOptions): ScanResult;

export type ScannerOptions = {
  appId: string;
  vocabVersion: string;     // pins the graph to classify against (default VOCAB_VERSION)
  profileVersion: string;
  contrastTier: ContrastTier;   // vendor-declared; feeds refBasePassesTier
};

export type ScanResult = {
  manifest: AppManifest;          // the proposed manifest (subject to vendor confirmation)
  coverage: CoverageReport;
};
```

### 8.4 Coverage report shape

```ts
export type CoverageReport = {
  classified: Array<{ name: VarName; role: RoleId; confidence: "confirmed" | "inferred" }>;
  needsConfirmation: Array<{ name: VarName; reason: CoverageReason }>;  // routed to vendor confirmation
  unmapped: VarName[];            // vars with no role classification
  opaqueSheetCount: number;       // non-empty ⇒ downgrade per §5
};

export type CoverageReason =
  | "color_mix"          // §5: color-mix has no single emit space → vendor confirmation
  | "opaque_sheet"       // §5: non-empty opaqueSheets downgrades inference unless held-format corroborates
  | "low_confidence_inference"
  | "ambiguous_role";
```

**Scan inference rules (verbatim §5, encoded by Plan 06):**
- **Raw-consumption carve-out:** `raw` wrapping → no imposed obligation, **held format dictates** emit.
- **`color-mix`** → low-confidence → routed to vendor confirmation (never a guessed emit).
- **`opaqueSheets` teeth:** non-empty → mechanically downgrade every var's consumption inference to
  `confidence:"inferred"` (needs vendor confirmation) unless corroborated by held format.
- The **shadcn "can" path** (`SHADCN_CAN`) ships first: no inferred consumption to downgrade.

---

## 9. Publish + Storage + Session — `apps/control-plane/src/theming/publish/` & `.../authoring/`  (Plan 05)

### 9.1 The three storage interfaces (verbatim §9 / §12: relational governance / content-addressed blob / short-TTL pointer)

```ts
// Content-addressed blob store (R2): immutable artifacts keyed by hash.
export interface BlobStore {
  putArtifact(hash: string, artifact: ThemeArtifact): Promise<void>;   // idempotent (content-addressed)
  getArtifact(hash: string): Promise<ThemeArtifact | null>;
}

// Short-TTL mutable pointer store (KV): tenant → Pointer.
export interface PointerStore {
  getPointer(tenant: string): Promise<Pointer | null>;                 // null = pointer miss (distinct from disabled)
  putPointer(tenant: string, pointer: Pointer): Promise<void>;
}

// Relational governance store (D1): the audit trail + the functional read path (reset/recompile §4.4/§9).
export interface AuditStore {
  recordAudit(row: AuditRow): Promise<void>;
  getPublishedSpec(tenant: string, hash: string): Promise<PublishedRecord | null>;  // reset/recompile read path
}
```

### 9.2 The audit row (verbatim §9)

```ts
export type AuditRow = {
  tenant: string;
  hash: string;                  // the published artifact hash
  prompt: string;                // the tenant admin's prompt (control-plane-side only; never in the bundle)
  styleSpec: StyleSpec;          // the produced spec — STORED (functional read path, §9)
  verifierReport: Verdict;
  actor: string;                 // tenant admin identity
  timestamp: string;             // ISO
  vocabVersion: string;          // versions live AT PUBLISH (stamp, §9)
  profileVersion: string;
};

// The reset/recompile read path payload (the stamped spec + its versions).
export type PublishedRecord = {
  styleSpec: StyleSpec;
  vocabVersion: string;
  profileVersion: string;
};
```

### 9.3 The publisher (verbatim §9 — write order is load-bearing)

```ts
// Write order (fail-graceful): artifact to blob FIRST → flip pointer → record audit LAST.
// A crash between steps never leaves a pointer to a missing artifact.
export function publish(input: PublishInput, stores: PublishStores): Promise<PublishResult>;

export type PublishStores = { blob: BlobStore; pointer: PointerStore; audit: AuditStore };

export type PublishInput = {
  tenant: string;
  artifact: ThemeArtifact;
  styleSpec: StyleSpec;
  verifierReport: Verdict;       // must be { ok: true } — publish refuses a failed verdict
  prompt: string;
  actor: string;
  vocabVersion: string;
  profileVersion: string;
};

export type PublishResult = { hash: string; pointer: Pointer };

// Kill-switch is also a pointer write (§7.3).
export function setKillSwitch(tenant: string, status: "live" | "disabled", pointer: PointerStore): Promise<Pointer>;
```

### 9.4 The session state machine (verbatim §4.4)

```ts
export type Session = {
  tenant: string;
  draft: StyleSpec;              // last ACKNOWLEDGED state (null-free, canonicalized); accumulator of acknowledged deltas
  candidate?: CandidateTheme;    // the pending (unacknowledged) compiled candidate for the current turn
  pendingSpec?: StyleSpec;       // the merged spec underlying `candidate`, awaiting acknowledgment
  published: string | null;      // hash end users see (null = nothing published yet)
};

// Each turn: parse delta → merge onto draft → compile → verify → produce one of three outcomes.
export type TurnResult =
  | { kind: "diff";     diff: FieldDiff[]; candidate: CandidateTheme; pendingSpec: StyleSpec }  // non-empty diff: preview renders candidate; ack commits it into draft
  | { kind: "no_change" }                                                                       // empty diff: "No visual change from that"
  | { kind: "rejected"; failures: (WallFailure | VerifyFailure)[] };                            // wall/verifier reject; draft UNTOUCHED

export function runTurn(session: Session, delta: StyleSpec, manifest: AppManifest): TurnResult;

// Acknowledgment commits the pending candidate into the draft (the prerequisite for publish, §4.4).
export function acknowledge(session: Session): Session;   // draft ← pendingSpec; clears candidate/pendingSpec

// Reset (§4.4): draft ← loadPublishedSpec(published) OR draft ← appDefault (the empty spec).
export function resetToPublished(session: Session, audit: AuditStore): Promise<Session>;
export function resetToAppDefault(session: Session): Session;
export const APP_DEFAULT_SPEC: StyleSpec;   // the empty (canonicalized) spec ≡ app default
```

### 9.5 MockAgent + golden test strategy (verbatim §8)

```ts
// Feeds canned StyleSpecs (or raw JSON to drive parseSpec). The zero-LLM test harness for the whole
// merge → compile → verify → publish half. Implements the Agent interface (§10 / Plan 07).
export class MockAgent implements Agent {
  constructor(canned: Array<{ classification: GateClassification; spec: unknown }>);
  // …implements gatekeep + design below
}
```

> Golden-file targets (§8): the compiler's serialized output (format-contract regression net), and an
> adversarial StyleSpec suite for the verifier. Plan 05 owns the MockAgent and the e2e loop test;
> Plan 02 owns the compiler golden files; Plan 03 owns the verifier adversarial suite.

### 9.6 Failure-UX templates (verbatim §1.2 / §12 — deterministic, keyed on failure code)

```ts
// Deterministic templates keyed on wall/verifier failure code. An LLM only phrases, never decides.
export function failureTemplate(failure: WallFailure | VerifyFailure): FailureMessage;

export type FailureMessage = {
  code: WallFailureCode | VerifyFailureCode;
  headline: string;        // deterministic
  detail: string;          // deterministic, fillable from the failure fields
  suggestion?: string;     // optional steer (e.g. "try a lighter primary")
};
```

---

## 10. LLM Stages + Next.js Delivery — `apps/control-plane/src/theming/authoring/` & `apps/<host>/`  (Plan 07)

### 10.1 The Agent interface + classification enum (verbatim §1.2)

```ts
// The non-deterministic stages — BOTH sit BEFORE the wall. MockAgent (Plan 05) and the real
// qwen-backed agent (Plan 07) implement this.
export interface Agent {
  // Stage 1: Gatekeeper (cheap LLM, NOT the gate) — one classification call.
  gatekeep(input: GatekeeperInput): Promise<GatekeeperResult>;
  // Stage 2: Designer (quality LLM) — the one creative call. Emits a SPARSE StyleSpec as raw JSON
  // (to be parsed by the wall, NOT trusted). Fed the constraint envelope.
  design(input: DesignerInput): Promise<DesignerResult>;
}

export type GateClassification =
  | "in_scope_styling"
  | "out_of_scope"
  | "targets_locked_invariant"
  | "abuse_or_injection";

export type GatekeeperInput = {
  prompt: string;
  envelope: ConstraintEnvelope;     // for context (locks/allowedFonts so it classifies in-bounds)
};

export type GatekeeperResult = { classification: GateClassification; reason?: string };

export type DesignerInput = {
  prompt: string;
  draft: StyleSpec;                 // current acknowledged draft as context
  envelope: ConstraintEnvelope;     // the constraint envelope (UX/cost optimization, NOT enforcement)
};

// The Designer returns RAW JSON (unknown) — it crosses the wall via parseSpec, never trusted as typed.
export type DesignerResult = { specJson: unknown };
```

### 10.2 The constraint envelope (verbatim §1.2)

```ts
// The manifest's invariants fed to the LLM stages so they propose in-bounds rather than get rejected
// after — a UX/cost optimization only; the wall + verifier remain the enforcement.
export type ConstraintEnvelope = {
  contrastFloor: { tier: ContrastTier };
  locks: (SeedId | RoleId)[];
  allowedFonts: Array<{ id: FontStackId; stack: string }>;
  chromaCap: number;
  defaultSeeds: AppManifest["defaultSeeds"];   // so "darker" has a baseline when draft is empty
};

export function buildEnvelope(manifest: AppManifest): ConstraintEnvelope;
```

### 10.3 The Next.js delivery adapter — `apps/<host>/`  (verbatim §1.3 / §7.2)

```ts
// SERVER (SSR): resolves tenant → pointer → artifact → resolved-mode styleTag injected into <head>.
// Fail open everywhere: pointer miss, hash mismatch, unsafe value, or no CSP nonce → inject nothing.
export async function resolveThemeTag(args: {
  tenant: string;
  mode: Mode;                  // resolved mode from the cookie (or manifest.modes.default on cold-start)
  nonce: string;               // server-minted CSP nonce
  stores: { pointer: PointerStore; blob: BlobStore };
}): Promise<{ tag: string } | { tag: null; reason: FailOpenReason }>;

export type FailOpenReason =
  | "pointer_miss"             // no key (distinct telemetry event, §7.3)
  | "pointer_disabled"         // status:"disabled" kill-switch (distinct telemetry event)
  | "artifact_missing"         // hash not in blob store
  | "hash_mismatch"            // fetched artifact does not match pointer hash
  | "unsafe_value"             // isSafeCssTokenValue failed at apply time
  | "no_nonce";                // CSP enforced + no nonce → fail open

// CLIENT bootstrap: resolve system → concrete mode, persist the mode cookie, swap if it differs
// from the server-rendered default (the bounded cold-start flash, §7.2).
export function bootstrapMode(args: { doc: Document; defaultMode: Mode }): void;
```

---

## 11. Cross-plan dependency summary (who imports what)

| Contract | Owner (defines) | Consumers (import) |
|---|---|---|
| `RoleGraph`, `Derivation`, `ContrastPair`, `ivRoles1`, `getRoleGraph`, `requiredContrast`, primitive aliases | 01 (`roles/`) | 02, 03, 06 |
| `StyleSpec`, `OklchColor`, `Oklch`, `FontStackId`, `parseSpec`, `WallFailure(Code)` | 01 (`spec/`) | 02, 03, 05, 07 |
| `mergeDelta`, `canonicalize`, `diffSpecs`, `FieldDiff` | 01 (`session/`) | 05, 07 |
| `AppManifest`, `Shape`, `Space`, `EmitContract`, superRefine names, `SHADCN_CAN` | 01 (`manifest/`) | 02, 03, 04, 05, 06, 07 |
| `RampProfile`, `ModeProfile`, `ivProfile1`, `getRampProfile`, `compile`, `CandidateTheme` | 02 (`compile/`, `profile/`) | 03, 04, 05 |
| `Verdict`, `VerifyFailure(Code)`, `verify`, `isSafeCssTokenValue` | 03 (`verify/`) | 04, 05, 07 |
| `ThemeArtifact`, `buildArtifact`, `hashArtifact`, `renderStyleText`, `styleTag`, `applyTheme`, `Pointer` | 04 (`artifact/`) | 05, 06(client re-export), 07 |
| `ScanPayload`, `scan`, `runScanner`, `ScanResult`, `CoverageReport` | 06 (`scan/`, `scan-sdk/`) | 05 (manifest e2e) |
| `BlobStore`, `PointerStore`, `AuditStore`, `AuditRow`, `PublishedRecord`, `publish`, `setKillSwitch`, `Session`, `TurnResult`, `runTurn`, `acknowledge`, `MockAgent`, `failureTemplate` | 05 (`publish/`, `authoring/`) | 07 |
| `Agent`, `GateClassification`, `Gatekeeper*`, `Designer*`, `ConstraintEnvelope`, `buildEnvelope`, `resolveThemeTag`, `bootstrapMode` | 07 (`authoring/`, `apps/<host>/`) | 05 (implements `Agent` via MockAgent) |

> **Circular-name note:** `MockAgent` (Plan 05) implements the `Agent` interface (Plan 07). To avoid a
> build cycle, the `Agent`/`Gatekeeper*`/`Designer*`/`GateClassification`/`ConstraintEnvelope` type
> declarations live in a Plan-07-owned but dependency-light module
> (`apps/control-plane/src/theming/authoring/agent-types.ts`) that Plan 05 imports types-only. Plan 07
> supplies the real implementation; Plan 05 supplies `MockAgent`.

---

## 12. Naming rules the 7 authors MUST follow

1. **Resolved mode is `Mode` (`"light" | "dark"`); the StyleSpec axis is `SpecMode` (adds `"both"`).**
   Never widen `Mode` with `"system"` or `"both"`.
2. **`f(tier, category)` is exported as `requiredContrast`.** Prose may say `f`; code says
   `requiredContrast`.
3. **`StyleSpec` is both the zod value and the inferred type** (shared identifier). Same for
   `AppManifest`, `ThemeArtifact`, `Pointer`, `ScanPayload`, `OklchColor`/`FontStackId`.
4. **The wall entry is `parseSpec(json, manifest)`** and returns `ParseResult` (discriminated on
   `ok`). The compiler is `compile(draft, manifest)`. The gate is `verify(theme, manifest)`. These
   three signatures are frozen.
5. **Failure codes are string-literal unions named `WallFailureCode` and `VerifyFailureCode`** with
   exactly the members listed. The failure-UX layer (Plan 05) and delivery telemetry (Plan 07) switch
   on these — do not add members without updating this ledger.
6. **`Space` includes the literal `null`** (not `"null"`). `Shape ∈ {triple, function, raw, number}`.
7. **Storage interfaces are `BlobStore` / `PointerStore` / `AuditStore`** with exactly the methods
   above. The publisher write order (blob → pointer → audit) is contractual, not stylistic.
8. **`renderStyleText` is the pure core; `styleTag` (server, nonce handed in) and `applyTheme`
   (client, nonce discovered) are the two sinks.** All three live in `@invariance/theming/artifact`
   and are re-exported to the client applier from `packages/client/src/theming`.
