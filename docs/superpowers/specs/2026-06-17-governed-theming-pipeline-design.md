# Governed Theming Pipeline — Consolidated Design

**Date:** 2026-06-17
**Status:** Design locked (wall-grade contracts). Assembly + eyes-on tuning remain.
**Scope:** Tier-A governed, natural-language theming — the MVP/wedge. The business-logic plane is out of scope here.

> This document is a **clean greenfield design**. It defines the interfaces and laws of the new
> pipeline without reference to the current implementation. Mapping each contract onto existing
> code (reuse vs. build-new) is a later, separate step — reuse-first would let the old code's
> assumptions (subject=user not tenant, always-emit-hex) constrain the new design through the back
> door, so the contracts are designed first and the substrate is fitted to them afterward.

---

## 0. The one rule, and the property that everything rests on

**The one constraint:** no production request transits Invariance. That forces two planes:

- **Control plane** (our infra) — all the *thinking*: scanning, the LLM pipeline, verification,
  publishing. Allowed to be slow.
- **Data plane** (customer infra) — what end users hit on every page load: must be fast, and must
  never be able to take the vendor's app down. Fails open to the vendor's base design everywhere.

**The load-bearing property:** **the LLM is in the loop but never in the gate, and the StyleSpec is
the wall between them.** Both non-deterministic stages (Gatekeeper, Designer) sit *before* the
StyleSpec. Everything to the right of the wall is deterministic code that never sees raw model text
again. A hallucinated or adversarial proposal can therefore only ever be *rejected*, never
published. The corollary — which drives the test strategy (§8) — is that the entire valuable half
(merge → compile → verify → publish) is testable with **zero LLM** by hand-writing StyleSpecs.

**Three actors, never overlapping:** the **vendor engineer** (sets it up once), the **tenant admin**
(customizes through prompts, within invariants), the **end user** (just loads the page).

**Multi-tenant hierarchy:** Invariance → **app / vendor** (owns the manifest, declared once) →
**tenant** (owns a theme, prompted by its brand admin) → **end users** (belong to a tenant). The
manifest is per-app; the live theme pointer is per-tenant.

---

## 1. The loop (three phases)

### 1.1 Onboarding (vendor, once)

The SDK runs on the live app and produces a **ScanPayload** (§5). The control-plane **Scanner**
classifies each `--*` variable into a role (OKLCH classification against the role graph) and infers
its **format contract**, producing a **coverage report** and, on vendor confirmation, the per-app
**AppManifest** (§6). For a shadcn app, variables/formats/modes are known in advance, so a prebuilt
**"can"** skips scan-and-confirm — the near-zero-touch path, and the v1 demo path.

### 1.2 Customize (tenant admin, per change)

A prompt crosses the trust boundary as follows:

1. **Gatekeeper** (cheap LLM, *not* the gate) — one classification call:
   `in_scope_styling | out_of_scope | targets_locked_invariant | abuse_or_injection`. Tuned for UX
   and cost, not paranoia (the verifier still holds if a jailbreak slips through). Rejections are a
   UX surface, not a flat no.
2. **Designer** (quality LLM) — the one creative call. Emits a **sparse StyleSpec** (only the fields
   it means to touch), with the current draft as context. The manifest's invariants (contrast floor,
   locks, `allowedFonts`) are fed to the LLM stages as the **constraint envelope** so they propose
   in-bounds rather than getting rejected after — a UX/cost optimization only; the wall and verifier
   remain the enforcement.
3. **The wall** — parse-don't-validate against the closed StyleSpec schema (§3). Failure → reject the
   turn, draft untouched.
4. **Merge** (pure) — fold the sparse delta onto the draft (§4), producing the full next draft.
5. **Compiler** (pure) — `compile(draft, manifest) → CandidateTheme` (§4.4).
6. **Verifier** (pure, the gate) — `verify(theme, manifest)` (§4.5). Pass → preview/publishable; fail
   → keep prior version, failure-UX.
7. **Publisher** (only on explicit publish) — write artifact → flip pointer → record audit (§7).

Compiler + verifier run **every turn** to produce a preview; the Publisher runs **only on explicit
publish**. Preview reuses the production applier against a same-origin reference gallery, without
touching the pointer store.

### 1.3 Apply (end user, every page load)

The request carries a cookie with a **resolved** mode. The data-plane applier reads the tenant's
pointer, fetches the immutable artifact by hash, picks the resolved mode's value set, and inlines a
`<style>` into `<head>` (SSR) or injects it via a blocking script (fallback). **Fail open
everywhere:** pointer miss, hash mismatch, unsafe value, or no CSP nonce → inject nothing, base
design renders.

---

## 2. The wall-grade spine (locked contracts)

Five contracts are *wall-grade* — the boundaries everything deterministic compiles against: the
**role graph** (§3), the **StyleSpec wall + delta-merge/session** (§4.1–4.4), the **scan payload**
(§5), the **manifest** (§6), and the **artifact/applier/pointer** (§7). The **compiler** (§4.5) and
**verifier** (§4.6) are the pure *consumers* of these, not separate boundaries. Each is pinned with
the same rigor. The remaining work (ramp-profile numbers, pipeline/session
orchestration, failure-UX templates, storage interfaces, the Next.js delivery adapter) is **assembly
and eyes-on tuning with no new boundaries to cross**.

The organizing principle across the spine is the **three-way cut**:

- **Role graph** carries *relationships and kinds* (version-stable, correctness).
- **Ramp profile** carries *numbers* (L-ladders, step magnitudes, seed nudges, radius offsets —
  eyes-on, golden-filed).
- **Manifest** carries *policy* (contrast tier, chroma cap, locks, allowed modes/fonts — per-app).

Required contrast ratio = `f(manifest.tier, graphPair.category)`. This factoring is what keeps the
graph version-stable while policy moves per-app. **Every remaining degree of freedom on the contrast
path is now a number (profile, eyes-on), not a relationship (graph, correctness)** — and the gate
catches any number that violates a relationship.

---

## 3. The role graph (`vocabVersion: "iv-roles-1"`)

**Two sets, not one — the backbone.** The input space (what the Designer/StyleSpec emit) and the
output space (what maps to vars and lands in the artifact) are different sizes; the graph is the
edges between them.

```ts
RoleGraph = {
  seeds: SeedId[]                       // StyleSpec INPUT axes — small
  roles: Record<RoleId, { kind: "color" | "dimension" | "typography", derivation: Derivation }>
  contrastPairs: Array<{ fg: RoleId, bg: RoleId, category: "text" | "large-text" | "ui" }>
}

Derivation =
  | { kind: "seed",           seed: SeedId }                  // role IS a seed (primary, accent, destructive, radius)
  | { kind: "surface-anchor", seed: "neutral" }              // background — the mode-dependent base surface
  | { kind: "surface-step",   seed: "neutral", step: StepId } // card, popover, muted, secondary
  | { kind: "line-step",      seed: "neutral", step: StepId } // border, input
  | { kind: "foreground-of",  bg: RoleId, strategy: "maximize-contrast" | "minimum-legible" }
  | { kind: "accent-line",    seed: SeedId }                  // ring
  | { kind: "offset",         seed: "radius", step: StepId }  // radius-sm/md/lg/xl
  | { kind: "pick",           axis: "display" | "body" | "mono" }
```

**`seeds`** = `primary, accent, neutral, destructive, radius, density, mode` + the three typography
picks. **`neutral` is seed-only** — there is no `--neutral` var; it seeds the surface/line ramp.
`primary/accent/destructive/radius` are *both* seeds and output roles (their derivation is
`{kind:"seed"}`). **`density` is a present-but-empty seed in `iv-roles-1`** — a real input axis (the
Designer can hear "more compact") with zero output roles in the shadcn instance (Tailwind owns
spacing; we do not invent spacing tokens). Versioning the axis, not its current expansion, keeps the
wall stable when a later MUI/Chakra adapter has density-drivable vars.

**`roles` — the v1 shadcn instance (27 core roles):**

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

**`chart-1..5` and `sidebar-*` are deferred to a later vocab** — categorical chart colors need
hue-rotation, not a ramp, and sit off the contrast-critical path. The defer is **free because a
manifest already pins `vocabVersion`**: an `iv-roles-1` manifest keeps meaning `iv-roles-1` after
`iv-roles-2` ships.

**`contrastPairs` — the verifier's check set and the compiler's repair set,** with real
accessibility semantics, not mechanical pairing:

- `text`: `(foreground,background)`, `(card-fg,card)`, `(popover-fg,popover)`, `(primary-fg,primary)`,
  `(secondary-fg,secondary)`, `(accent-fg,accent)`, `(destructive-fg,destructive)`
- `large-text`: `(muted-fg, muted)` — `muted-fg` is deliberately quiet; held to the large/secondary
  floor, not body text.
- `ui`: `(ring, background)`, `(ring, card)`, `(ring, popover)` — a focusable control can sit on any
  of the base surfaces, so `ring` is checked against the **set** (WCAG 2.2 focus visibility). Ring on
  `muted`/`secondary` is documented out of scope for v1.
- **`border` and `input` are intentionally *not* checked** — both treated as decorative. Forcing
  3:1 on `border` would wreck the subtle-border look every shadcn app has. `input` is exempt under
  the **explicit assumption** that an input is identified by more than its resting border (label,
  placeholder, layout) and that its **focus** state — the one WCAG 2.2 most cares about — is covered
  by the `ring` `ui`-pairs. If a vendor's inputs are distinguished *only* by their resting border,
  `(input, background)` should be added as a `ui` pair for that app (a per-app extension, not the v1
  default).

### 3.1 The three graph laws

1. **Mode-polarization, keyed on `kind`.** `kind:"color"` derivations are **mode-polarized**;
   `dimension`/`typography` are **mode-stable**. The ramp profile is therefore mode-indexed
   (`{ light: ModeProfile, dark: ModeProfile }`), and a `color` derivation resolves against the
   *active mode's* `ModeProfile`. `surface-anchor`/`surface-step`/`line-step` read a **per-mode
   anchor-L and per-mode step ladder** — never a single signed `anchor + 0.03` applied blindly (that
   is the invisible-dark-card bug). `foreground-of` needs no second ladder of its own — it is
   *computed* against the active mode's resolved bg, so it flips correctly for free. Seeds may carry
   an optional per-mode adjustment (the "primaries lift/desaturate in dark" nudge). `offset`/`pick`
   are single-valued across modes. This is the graph hook for "dark ≠ inverted light."

2. **Repair direction.** The repair loop adjusts the **L of the `fg` member** of a failing
   `contrastPair`, holding the `bg` member, until the floor clears or the iteration cap is hit
   (→ candidate fails the gate; prior version stays). **Seeds are fixed points** as a corollary — no
   seed is ever a `fg` member, so the brand color the tenant chose never moves during repair, and the
   perturbed node is always uniquely determined (golden-file stable). This also disambiguates
   derived/derived pairs like `(foreground, background)`: `foreground` moves, `background` (the
   held `surface-anchor`) does not.

3. **Foreground search.** `maximize-contrast` and `minimum-legible` are the *same* monotonic search,
   different stop rule: both step the foreground's L from `bg.L` toward the contrast-increasing
   extreme (the one across mid-L from the bg), holding H/C. `maximize-contrast` runs to the extreme;
   `minimum-legible` **stops at the first step that clears the floor** (least perturbation that is
   legible). Strategy sets the *initial placement*; the repair loop is the monotonic safety net
   beneath it.

**Lock projection (graph-driven):** a lock targets either a **seed** or an **output role**. A
**seed lock** (including the seed-only `neutral`) **wall-rejects any StyleSpec that sets that seed**,
which freezes its *entire derivation closure* at base — the single primitive for "freeze my surfaces"
(lock `neutral`) or "freeze my brand and everything derived from it" (lock `primary`). A lock on a
**derived output role** is *not* rejected at the wall; the compiler **pins that one token to base
post-expansion**, even if its seed moves. (A seed-named output role like `primary` resolves as a seed
lock, since the role *is* the seed.)

---

## 4. The StyleSpec (the wall), the merge, and the session

### 4.1 The StyleSpec schema

The StyleSpec is a **security artifact**, not just a type. Two properties make the wall hold: it is a
**closed schema** (`.strict()` — unknown keys rejected, so an invented field is a rejection, not a
silent ignore), and every value is **parsed into a typed form, not validated as a string**.

```ts
// Parses BOTH deltas and drafts. Leaves are .optional().nullable(): `undefined` = "not in this delta"
// (absent), `null` = the removal sentinel ("revert this role to app default"). The merge normalizes
// `null` out, so a DRAFT is always null-free (absence = app default everywhere downstream). The
// sentinel is leaf-only — the group objects are .optional() but NOT nullable.
const StyleSpec = z.object({
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
```

- **Sparse:** every field optional. The Designer emits only what it means to touch; faithfulness to
  unchanged fields is a *merge operation* (§4.2), not a model hope.
- **`OklchColor` is where parse-don't-validate lives:** the string is parsed to OKLCH and clamped to
  the chroma cap on the way in; an unparseable value (or a smuggled CSS breakout) fails to parse and
  the turn is rejected — the dangerous string never advances.
- **Fonts are an allowlist index, never a free string** — the LLM cannot make the app load an
  arbitrary external font (perf, licensing, tracking).
- **Lock projection at parse time:** a **seed lock** (any `SeedId`, including the seed-only
  `neutral`) wall-rejects a delta that sets that seed — freezing its whole closure at base (the
  "freeze my surfaces" / "freeze my brand" primitive). A **derived-role lock** is **never** rejected
  at the wall; the compiler pins that token to base post-expansion (§3.1, §4.5), so a legal seed
  change that happens to feed it stays legal. (The lock projects from var→role space.)
- **Sentinel-as-typed-removal:** `null` is a legal *delta* value meaning "delete this key → revert
  this role to app default." It is the single recognized removal verb, keeping the wall a single
  closed schema (vs. a second op-algebra). `null` is a JSON primitive — trivially safe to parse, no
  breakout surface.

### 4.2 The delta-merge (pure, post-wall)

`mergeDelta(draft, delta)` folds a parsed sparse delta onto the current draft:

- **Structural, not a shallow spread.** A shallow `{...draft, ...delta}` wipes siblings — a delta of
  `{ colors: { accent } }` would drop `primary`/`neutral`. The merge recurses one level into the
  nested groups (`colors`, `typography`), sets/deletes at the leaf, and shallow-sets the scalars
  (`radius`, `density`, `mode`).
- **Sentinel normalized out → draft is always null-free.** `null` in the delta means `delete`; the
  draft never contains `null`. So everything downstream (compiler, `diffSpecs`, decompile, equality)
  keeps the clean invariant **absence = app default** and never needs a null branch. The sentinel is
  one branch in one function.
- **Canonicalization is total and runs after every merge.** Empty groups are removed
  (`colors: {}` ⇒ `colors` absent), so the post-merge draft has **exactly one representation**. This
  makes "draft == appDefault?" a clean structural equality — required for the empty-diff case.
- **Per-leaf single instruction ⇒ intra-turn merge is commutative** (a leaf is one JSON value, either
  `null` or not — no intra-delta conflict). Cross-turn is sequential-by-session (the intended
  history).

### 4.3 The diff (three-state, post-merge, never crosses the wall)

`diffSpecs(prevDraft, nextDraft)` — both operands are full, parsed, post-merge — walks the closed
role set and emits per touched field `{ role, from, to, kind }`, `kind ∈ added | changed | removed`:

- A color "change" shows **resolved values** (the OKLCH the compiler will use), not the raw model
  string — the user sees truth.
- A field set to its current value is a **no-op → emit nothing**.
- A **sentinel-driven revert** surfaces as `kind:"removed"` with `to` = the **app-default resolved
  value** — the sentinel and the three-state diff were designed for each other.

The diff is computed entirely **after** the wall, on typed specs, so it is deterministic and can
never be an attack surface.

### 4.4 Session model & draft lifecycle

Customization is a conversation that ends in a publish. The session holds **`draft: StyleSpec`** —
the last **acknowledged** state, i.e. the accumulator of acknowledged deltas — separate from
**`published: hash`** (what end users see). Each turn merges the parsed delta onto `draft` to form a
**candidate**; compile + verify run on the candidate to produce the preview; **the diff-confirm
acknowledgment is what commits the candidate into `draft`** — an unacknowledged successful turn does
*not* advance `draft`. So three acknowledged "make it darker" turns accumulate into one composite
draft, and one publish ships it. (Whether a fresh prompt before acknowledgment refines the pending
candidate or restarts from the acknowledged draft is an orchestration detail — §12.)

Three outcomes per turn, each a first-class render:

- **Non-empty diff** → show field-level changes; preview renders the candidate; **acknowledgment
  commits the candidate into the draft and is the prerequisite for publish** (the diff-confirm gates
  *intent*, not safety — the verifier already gated safety).
- **Empty diff** (model returned the same values, or a no-op delta) → *"No visual change from that"*;
  preview unchanged, nothing to confirm. Distinguishes "heard you, nothing moved" from silent
  failure.
- **Rejected at the wall or the verifier** → failure-UX path; **the draft is untouched**, so the
  conversation continues from the last good draft, never a half-applied state
  (corruption-by-conversation).

**Reset** is `draft ← loadPublishedSpec(published)` **= load the StyleSpec stored with the published
version** (§7), *not* an inverse of the compiler (token→seed is lossy/underdetermined). Or
`draft ← appDefault` (the empty spec). **Publish** is the deliberate action that flips the pointer.

### 4.5 The compiler (pure)

`compile(draft, manifest) → CandidateTheme`, where
`CandidateTheme = { light: Record<VarName,string>, dark?: Record<VarName,string>, meta }`. Pure:
same inputs → byte-identical output, no `Date.now()`/`Math.random()`/I/O. That purity is what makes
the verifier's verdict meaningful and lets the whole thing be golden-filed.

**`base` is the canvas; seeds repaint only their sub-tree — transitively.**

> For each output role, **emit `base[mode][role]` verbatim unless the role's derivation transitively
> depends on a seed present in the draft**, in which case re-derive it. The dependency test is the
> **transitive closure over derivation edges**, not one-hop seed-membership: `ring` is
> `accent-line(primary)`, so setting `primary` must re-derive `ring` (else a base-verbatim `ring`
> drifts off the old `primary`). Re-derivation runs as a **topological walk over the affected
> closure** — `foreground-of(card)` cannot be computed until `card`'s re-derived L is known.

This means an empty draft compiles to the app's **exact base** (perfect fidelity, no ramp
approximation), and a tenant who sets `primary` re-derives only the primary closure while every
untouched surface stays byte-identical to base.

Compile jobs, in order:

1. **Expand** the affected closure → tokens (the design system in code; magnitudes from the profile).
2. **Contrast repair** per §3.1 law 2/3: `fg` moves, `bg` holds, seeds fixed; `minimum-legible`
   stops at floor, `maximize-contrast` runs to the extreme. `ring` is the lone **multi-pair repair**
   (clears the binding/closest-in-L surface of its set). **Root-pair hard-reject:** if
   `(foreground, background)` cannot clear even with `foreground` at the extreme, there is no move
   left (background held, foreground maxed) → the candidate fails the gate. The repair loop may only
   *raise* contrast.
3. **Generate dark separately** (two independent ladders; dark is not inverted light).
4. **Map + serialize per the format contract** — convert OKLCH → `emit.space` with **gamut-map on
   convert** (HSL/RGB are sRGB; the chroma cap helps but does not guarantee in-gamut), serialize
   `emit.shape` at fixed `emit.precision` (precision is also the determinism lever). **Locked roles
   are written last, copying base verbatim**, structurally re-asserting they are untouched.

### 4.6 The verifier (the gate, pure)

`verify(theme, manifest) → { ok: true } | { ok: false, failures }`. It re-checks the **final
serialized output** and **trusts nothing upstream — not the LLM, not even the compiler**. It
**re-parses every emitted string** and independently confirms:

- contrast ≥ `f(manifest.tier, pair.category)` for every `contrastPair`, in every allowed mode (a
  gamut clamp that pushed a foreground under floor is caught *here*, on the emitted triple);
- every locked variable equals its base — precisely `emit(base[mode][role]) == emittedVar` (base is
  role-keyed), for both pinned derived-role locks and seed-frozen closures;
- no color exceeds the chroma cap;
- emitted modes ⊆ `manifest.modes.allowed`;
- `isSafeCssTokenValue` on every value — implemented as **parse-then-reserialize**, not a regex, so a
  string containing a CSS breakout structurally cannot pass.

Pass → accept. Fail → keep the prior published version; hand structured failures to the failure-UX
layer (deterministic templates keyed on failure code; an LLM only phrases, never decides).

---

## 5. The scan contract (`ScanPayload`)

The hardest Phase-1 problem is **format-contract inference**, and its rule is **consumption dictates,
held cross-checks**: the *consumption wrapping* at a use-site dictates the emit obligation; the
*held* (as-authored) format is the cross-check. **CSSOM is the source of truth; `getComputedStyle`
is corroboration** — `getComputedStyle` only sees the *active* mode, so the other mode's held values
are read straight from the CSSOM rules (not by toggling the live DOM), and `getComputedStyle` is
demoted to enumerator + active-mode cross-check + var-chain resolver.

```ts
ScanPayload = {
  scanVersion: number
  origin: string
  variables: Array<{
    name: VarName
    declarations: Array<{
      selector: string                              // ":root" | ".dark" | "[data-theme='dark']" | …
      mode: "light" | "dark" | "unknown"            // inferred from selector
      rawValue: string                              // held / as-authored, e.g. "0 0% 100%"
      heldFormat: "hsl-triple" | "rgb-triple" | "hex" | "oklch" | "number" | "keyword" | "unknown"
    }>
  }>
  consumption: Record<VarName, Array<{
    wrapping: "hsl" | "rgb" | "oklch" | "raw" | "color-mix" | "other"   // hsl(var(--x)) vs raw var(--x) vs …
    selector: string; property: string
  }>>
  opaqueSheets: string[]                            // cross-origin sheets that threw SecurityError on .cssRules
}
```

- **Raw-consumption carve-out:** for `raw` consumption (`var(--x)` with no wrapping) there is no
  imposed obligation, so **held format dictates** the emit shape. Consumption only dictates when it
  *wraps*.
- **`color-mix` has no single emit space, so it gets explicit teeth:** the channel space of a
  `color-mix(...)` site depends on its arguments, so a var consumed that way has no well-defined
  `emit.space`. For v1 it is **treated as low-confidence → routed to vendor confirmation** (never a
  guessed emit), exactly like an opaque sheet. The shadcn "can" path uses no `color-mix`, so it is
  unaffected; broader support is deferred.
- **`opaqueSheets` has teeth:** because consumption could hide inside an unreadable sheet, a non-empty
  `opaqueSheets` **mechanically downgrades every var's consumption inference to "needs vendor
  confirmation"** (manifest `confidence:"inferred"`) unless corroborated by held format — never a
  silently-guessed emit. This is the honest form of "require CORS-or-confirmation," and it is why the
  **shadcn "can" path ships first**: it has no inferred consumption to downgrade, so the demo never
  rides on general CSSOM inference being perfect.

The Scanner consumes a `ScanPayload` and produces the manifest's `variables` map (var→role +
`emit` + `confidence`), the per-mode `selectors`, the captured `base`/`defaultSeeds`, and the
coverage report.

---

## 6. The manifest schema (`AppManifest`)

Per-app, declared once at onboarding, pins both versions, read by everything downstream.

```ts
AppManifest = {
  appId: string
  manifestVersion: number
  vocabVersion: string                  // pins the role graph — "iv-roles-1"
  profileVersion: string                // pins the ramp profile

  variables: Record<VarName, {          // the var↔role bridge — core onboarding output
    role: RoleId                                         // ∈ the pinned vocab's roles
    emit: { shape: Shape; space: Space; precision: number }  // format contract (§5)
    confidence: "confirmed" | "inferred"
  }>

  modes: {
    allowed: ("light" | "dark")[]                        // invariant: emitted modes ⊆ allowed
    default: "light" | "dark"                             // cold-start fallback (∈ allowed)
    selectors: { light: string; dark?: string }          // one selector per mode (multi/mode = out of scope v1)
  }

  base: { light: Record<RoleId, string>; dark?: Record<RoleId, string> }  // verbatim — fail-open, locked-role pins, untouched-role fallback
  defaultSeeds: { colors: { primary, accent, neutral, destructive }; radius; density }  // Designer delta baseline

  invariants: {
    contrastTier: "AA" | "AAA"                           // → f(tier, pair.category)
    chromaCap: number
    locks: (SeedId | RoleId)[]                           // seed-lock ⇒ wall-reject re-seed (freezes closure); derived-role lock ⇒ pin to base[mode][role]
    allowedFonts: Array<{ id: FontStackId; stack: string }>
  }
}
```

where `Shape ∈ {triple, function, raw, number}` and `Space ∈ {hsl, rgb, oklch, null}` — the
format-contract emit struct (locked in §7), the thing that fights the silent-corruption bug.

**`f(tier, category)`** — the pure function both compiler and verifier call:

| | `text` | `large-text` | `ui` |
|---|---|---|---|
| **AA** | 4.5 | 3.0 | 3.0 |
| **AAA** | 7.0 | 4.5 | 3.0 |

(`ui` stays 3.0 at AAA — WCAG does not raise non-text contrast.)

**Why both `base` and `defaultSeeds`:** `base` is stored verbatim because it is the canvas
(§4.5), the locked-role pin source, and the fail-open target; `defaultSeeds` is stored because the
Designer needs the current seed to compute "darker" when the draft is empty. **Locks store as
`RoleId[]` with no separate pin payload** — the verbatim `base[mode][role]` *is* the pin, so a lock
cannot disagree with itself, and it reuses the base store.

**superRefine — the manifest's first verification layer** (cross-field consistency the individual
field validators cannot see):

- `variables[*].role` and `locks[*]` ∈ the pinned vocab's role set; `modes.default ∈ modes.allowed ⊆
  {light,dark}`; `defaultSeeds` covers every seed; `allowedFonts` non-empty if any typography role is
  mapped; `emit.space` consistent with `emit.shape` (`triple`/`function` require non-null space;
  `raw`/`number` require null).
- **Base-passes-tier (the §3 gate, formalized and *blocking*):** ∀ `pair ∈ graph.contrastPairs`, ∀
  `mode ∈ allowed`, `ratio(base[mode][pair.fg], base[mode][pair.bg]) ≥ f(tier, pair.category)`. A
  vendor whose base fails the declared tier **cannot publish the manifest** until they lower the tier
  or fix base — it is a hard gate, not a warning. This is what makes every later per-publish failure
  **customization-attributable by construction** (an invariant, not a runtime discrimination that can
  be wrong). Sub-AA base themes → a future dual-classification refinement; the shadcn "can" base meets
  AA, so v1 does not need it.
- **Locks resolve, and derived-role pins have complete base:** every `locks` entry is either a
  `SeedId ∈ vocab.seeds` (a seed lock) or a derived output role; for each **derived-role** lock, ∀
  `mode ∈ allowed`, `base[mode][role]` exists — else the pin is dangling. (Seed locks need no
  per-role base entry; they freeze by preventing the re-seed.)
- **Per-mode selector presence:** every allowed mode has its selector recorded — a manifest allowing
  `dark` with no dark selector cannot emit a cascade-winning dark block (the invisible-override bug
  promoted to a validation failure, caught at manifest time, not first paint).

---

## 7. The applier, the artifact, and the pointer

### 7.1 The artifact (immutable, content-addressed)

```ts
ThemeArtifact = {
  schemaVersion: number, vocabVersion: string, profileVersion: string, appId: string,  // NO tenant
  modes: {
    light: { selector: string; vars: Record<VarName, string> }    // selector rides through from the manifest/scan
    dark?: { selector: string; vars: Record<VarName, string> }
  },
  meta: { verifierReport, contrastFloor, chromaCap, ... }          // applier ignores
}
// hash = content-address over canonical JSON (excluding hash itself)
```

**No `tenant` in the artifact** — it is a pure value keyed by its own content, so dedup is automatic,
caching is sound (two tenants on the same hash cannot observe each other), and the audit story stays
clean. The **tenant→hash binding is the pointer's job**.

### 7.2 The applier (one pure core, two sinks)

The byte-identical, golden-filed heart is the **pure renderer**; the injection sink differs by plane:

```ts
renderStyleText(artifact, mode: "light" | "dark") → cssText   // pure: `${modes[mode].selector} { --x: val; … }`
//  server:  styleTag(artifact, mode, { nonce })       → "<style nonce>…</style>" to inline
//  client:  applyTheme(artifact, mode, { doc })        → injects <style nonce> at the END of <head>
```

- **Cascade-win.** `renderStyleText(artifact, "dark")` emits the dark vars **under the app's own dark
  selector** (`.dark`, `[data-theme="dark"]`, …), giving **specificity parity** with the app's native
  dark rule; the applier appends its `<style>` at the **end of `<head>`** so source-order breaks the
  tie in our favor. Emitting under a bare `:root` would silently lose to any app dark rule more
  specific than `:root`. This is why the single resolved-mode model still needs the per-mode selector.
- **Resolved mode only.** Apply-time mode is exactly `light | dark`. `"both"` is a *compile* concept;
  `"system"` is resolved to a concrete mode **before** SSR (the cookie carries a resolved mode; a
  one-time client bootstrap resolves `system → concrete` and persists it) so the server render is
  deterministic and flash-free.
- **Cold-start (system user, first paint, no cookie).** Tenant is server-determinable, so the server
  **renders the tenant theme in its configured default mode** (`manifest.modes.default`); the client
  bootstrap reads `prefers-color-scheme` and, if it differs, switches and persists the mode cookie.
  The flash is bounded to a single light↔dark swap of an *already-tenant-themed* page, system users
  only, first visit only — never a base↔themed lurch.
- **Nonce.** `styleTag` is *handed* the server-minted nonce; `applyTheme` *discovers* it via
  `doc.querySelector('style[nonce],script[nonce]')?.nonce` (the `.nonce` IDL property — the attribute
  is hidden in the DOM). No trusted element found **and** CSP enforced → inject nothing = **fail open**.
- **Preview decoupling is free** — the renderer only redefines variables, so it is substrate-agnostic.
  Preview = the same `renderStyleText` injected into our own **same-origin shadcn reference gallery**.
  Previewing the vendor's real (cross-origin) app needs a postMessage protocol — **deferred**.

### 7.3 The pointer (the data-plane contract)

```ts
Pointer = { hash: string, status: "live" | "disabled", updatedAt: string }   // KV: tenant → Pointer
```

URL is derived from `cdnBase` (app config) + `hash` — keeps the pointer tiny. **Publish/kill-switch
are both a pointer write.** A **pointer miss** (no key) and `status:"disabled"` (deliberate
kill-switch) both resolve to base, but they are **distinct telemetry events**.

---

## 8. Testing strategy — the determinism boundary pays off

Because the only non-deterministic stages (Gatekeeper, Designer) sit *before* the wall, the entire
valuable half is testable with **zero LLM**:

- **MockAgent** feeds canned StyleSpecs.
- **Golden-file the compiler's serialized output** — the regression net for the format-contract bug
  (hex vs. triple vs. wrong-channel-math) and for every profile-number change ("improving the design
  system" is a reviewable snapshot diff).
- **Adversarial StyleSpec suite for the verifier** — assert every invariant directly (contrast,
  locks, chroma cap, allowed modes, CSS-breakout strings).

The LLM stages are tested separately and loosely (does qwen produce a parseable sparse StyleSpec for
N prompts), because the wall bounds their blast radius.

---

## 9. Versioning & retention

Three distinct version pointers:

- **Manifest** pins the **active** `vocabVersion` + `profileVersion`.
- A **publish stamps** the produced StyleSpec with the versions live *at that moment*, and stores the
  StyleSpec in the audit row (this is now a **functional read path** — reset/recompile reads it).
- **Storage keeps every version ever stamped.**

**Retention is a hard, non-GC invariant:** graph and profile versions are **append-only and never
deleted while any stored StyleSpec references them**. Reset/recompile recompiles a stamped spec
against *its* graph + profile, not today's — so a GC'd profile version would turn a reset into a
miscompile-or-crash.

The publisher's write order is load-bearing for fail-graceful: **artifact to blob store first**
(content-addressed) → **flip the pointer** → **record the audit row** (prompt, styleSpec,
verifierReport, actor, timestamp, stamped versions). A crash between steps never leaves a pointer to a
missing artifact; the audit trail is the governance product.

---

## 10. Deferred / out of scope (named, not forgotten)

- `chart-*` / `sidebar-*` roles (categorical, hue-rotation) → a later `vocabVersion`.
- `tinted` foreground strategy → future strategy value.
- Cross-origin preview of the vendor's *real* app → postMessage protocol.
- **Preview fidelity gap:** preview themes a reference gallery; the vendor's real app has components
  the gallery does not. "Looks good in preview" does not guarantee un-previewed surfaces — a named
  visual limitation (the coverage report bounds the correctness risk, not the visual one).
- Sub-AA base themes → dual-classification of verifier failures.
- `density` output roles → MUI/Chakra adapters.
- The business-logic plane.

---

## 11. Build order

1. **StyleSpec schema + parser** (the wall) — full unit tests on rejection cases (closed schema,
   OklchColor parse failures, font allowlist, lock projection, sentinel).
2. **Compiler** on the shadcn canonical map — golden-filed (transitive re-derivation, repair laws,
   gamut-map, serialize-per-emit).
3. **Verifier** — with the adversarial-StyleSpec suite.
4. **MockAgent + the session/draft/merge/diff/preview/publish loop.**
5. **Swap in the real Gatekeeper/Designer last** — by then everything they feed is already proven
   safe.

Cross-cutting (build alongside): the **scan contract + Scanner** (canonical-map path first), the
**manifest schema + superRefine**, the **applier + artifact + pointer**, and the **Next.js delivery
adapter**.

---

## 12. What remains after this spec (no new boundaries)

- **Ramp profile numbers** — the L-ladders, step magnitudes, seed nudges, radius offsets. Cannot be
  fully paper-specced; scope v1 as "coherent on the shadcn reference gallery and passes the gate,"
  then iterate visually. Golden-filed so every change is a reviewable diff.
- **Pipeline / session orchestration** — assembling the locked stages.
- **Failure-UX templates** — deterministic, keyed on verifier/wall failure codes.
- **Storage interfaces** (relational governance / content-addressed blob / short-TTL pointer) bound to
  D1/R2/KV for v1, and the **Next.js delivery adapter** (then generic middleware, then blocking-script
  fallback).
