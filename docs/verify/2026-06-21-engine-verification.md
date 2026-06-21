# @invariance/theming — Cross-Cutting Invariant Verification

**Date:** 2026-06-21
**Branch:** `verify/engine`
**Scope:** the pipeline-spanning properties the governed-theming design was built around — *not* the
per-task unit tests (those already pass). New tests live in `tests/verify/` (a standalone
`@invariance/verify-engine` workspace package). **Engine source was not modified** (one temporary,
reverted mutation for the Group-D net check; `git status` clean — see §Methodology).

---

## One-line verdict

**The determinism boundary the whole design rests on is SOUND.** `compile()` is byte-identical
run-to-run (100×), across a fresh process under a mutated locale/timezone, and over hundreds of random
valid specs; over ~400 fuzzed *accepted* themes an **independent** WCAG/OKLab oracle found **zero**
cases where the verifier shipped an invariant violation; and **no rejected turn — wall or verifier —
ever mutated the draft**. No engine bugs were found.

---

## Baseline

| Suite | Files | Tests | Result |
|---|---|---|---|
| `@invariance/theming` (engine) | 36 | **273** | ✅ green |
| `@invariance/control-plane` | 40 | 245 | ✅ green (not re-run wholesale; theming stages exercised via `verify/`) |
| `@invariance/client` | 7 | 41 | ✅ green |
| **`tests/verify/` (this work)** | **7** | **117** | ✅ green |

> **Note on "69 tests":** the brief said *"all 69 task-level tests pass."* The engine package alone has
> **273** tests across 36 files (and 559 across the three theming-touching scopes). "69" most likely
> refers to the count of plan *tasks* across the 7-plan suite, not tests. The true green baseline is
> recorded above and was confirmed before and after this work.

---

## Methodology

1. **Independent re-derivation (the core rule).** The verifier's guarantees are checked by an oracle
   (`tests/verify/_oracle.ts`) that re-derives **WCAG 2.x contrast** (relative luminance from scratch)
   and **OKLCH chroma** (OKLab matrices from scratch) and **shares no code with the engine** — in
   particular it does **not** use `culori`, which the engine uses for *both* color parsing and
   `wcagContrast`. So a bug in culori (or in how the engine calls it) cannot hide behind the same bug
   in the checker. The oracle is itself TDD'd against canonical anchors (white/black = 21,
   `#767676`-on-white ≈ 4.54, sRGB red OKLCH chroma ≈ 0.2577) and a mutation of its companding curve
   was confirmed to turn the gray anchor RED.
2. **Mutation checks ("a net you've never seen fail…").** For the golden/format nets, the relevant
   contract was deliberately broken to confirm the test goes RED, then reverted. The oracle, the
   determinism baseline, and the format golden were each mutation-confirmed.
3. **No engine edits to force green.** The only engine edit in the whole pass was the temporary Group-D
   mutation (`oklch.ts` line 105 → `hsl(<triple>)`), reverted via `git checkout`. Final
   `git status --short packages/ apps/` shows no tracked engine modifications.
4. **Adversarial audit.** After the six groups were green, five independent agents (no shared context)
   re-derived the load-bearing numbers, hunted for vacuous/over-claiming tests, and critiqued coverage.
   They found **no engine bugs**; their concerns (all about test tightness) were addressed — see
   §Adversarial audit.
5. **Commits per group** on `verify/engine`.

---

## Results by group

### A. Determinism — **PASS** (the HALT BAR cleared)

`tests/verify/A-determinism.test.ts` (23 tests).

- **A1 — 100× in-process:** for 8 drafts × 2 manifests, `rawStringify(compile(draft))` is byte-identical
  across 100 calls.
- **A2 — fresh process:** a spawned `tsx` child (under `LC_ALL=de_DE.UTF-8`, `LANG=de_DE.UTF-8`,
  `TZ=Asia/Kolkata`) reproduces a **committed baseline** (`__fixtures__/A-compile-baseline.json`)
  byte-for-byte, identical to the in-process result. Corrupting the baseline was confirmed to turn the
  comparison RED — the net is non-vacuous.
- **A3 — property:** 250 random *valid* StyleSpecs compile deterministically; draft **key-insertion
  order does not change output**; and **canonicalize-equivalent** inputs (redundant null on an unset
  field) compile identically.

No nondeterminism observed. (Consistent with a source scan finding no `Date.now`/`Math.random`,
array/sorted-key output ordering, and locale-free `String(Math.round(...))` number formatting.)

### B. The wall bounds the LLM — **PASS**

`tests/verify/B-wall.test.ts` (39 tests).

- Every hostile input is rejected with the **correct `WallFailureCode`**, never coerced:
  CSS breakout / `var()` / `url()` / `expression()` / empty / `<script>` → `unparseable_color`;
  `.strict` unknown keys (top-level + nested) → `unknown_key`; arbitrary font id → `font_not_allowed`
  (null sentinel exempt); `radius > 24` / bad enums → `out_of_range`; re-seeding the locked `primary`
  (even via `null`) → `seed_locked`; structural junk / non-objects → `schema_invalid`.
- **Phase ordering** confirmed: a phase-1 (zod) failure **short-circuits** the manifest checks
  (`unknown_key` + a locked-seed set → only `unknown_key`); manifest checks **accumulate** when the
  schema passes (`seed_locked` + `font_not_allowed` together).
- **Positive controls** (named colors like `rebeccapurple`, boundary radius 0/24, allowlisted font)
  prove "reject" is a real discrimination, not a stuck always-reject.
- A **derived-role lock** (`card`) is *not* rejected at the wall (re-seeding its feeder `neutral` is
  allowed; the compiler pins it later).
- **Keystone (B8):** `parseSpec` does not mutate its input json; `runTurn` leaves the session
  **byte-identical** after every flavour of wall rejection — the corruption-by-conversation guard.

### C. Invariants survive a full pass — **PASS** (zero verifier gaps)

`tests/verify/C-invariants.test.ts` (14 tests).

- **C1 — fuzz (the centerpiece):** 300 prompt-shaped specs each against `SHADCN_CAN` (light) and a
  two-mode fixture (light+dark). For **every accepted theme**, the independent oracle re-parses the
  emitted artifact and re-derives contrast (both modes), chroma, and emitted-modes-⊆-allowed.
  **Result: zero verifier gaps** across ~400 accepted themes.
  - `shadcn-can`: 191 accepted / 109 rejected; `twomode`: 205 / 95. (Contrast rejections **are**
    reachable — `minimum-legible` lands `muted-fg` right at the floor and some random seeds can't clear.)
  - `minContrastMargin ≈ 0.000` (light) / `0.005` (twomode): the engine ships at the AA floor
    (minimum-perturbation repair), and engine-`culori` vs from-scratch-WCAG **agree within ~0.001**.
  - `maxChroma` 0.244 / 0.272 ≤ cap 0.3.
- **C1-meta:** the independent detector is proven **non-vacuous** (it flags a forced contrast collapse
  and an over-cap chroma).
- **C2 — root-pair hard-reject:** scanning 60 extreme neutrals per manifest produced **0** legal-seed
  `(foreground,background)` rejections — because `background`'s L is **profile-anchored** to the
  mode extreme, the root pair is effectively unreachable via legal seeds (a *defensive net*, not dead
  code). The gate that backs it is proven by **tampering** (`foreground := background` → `verify`
  rejects `contrast_floor`; oracle independently confirms ratio = 1.0; `publish` **refuses** the
  non-ok verdict → not shipped).
- **C3 — verbatim base:** a delta touching only `accent` leaves every non-closure var **byte-identical
  to base**.
- **C4 — transitive re-derivation:** setting `primary` re-derives `ring` (`accent-line(primary)`) and
  leaves `background` untouched (no-locks fixture); setting `neutral` moves all surface/line roles and
  leaves brand seeds put.
- **C5 — the verifier trusts nothing:** tampered compiler output is rejected for **all five**
  `VerifyFailureCode`s (`contrast_floor`, `locked_drift`, `chroma_cap`, `mode_not_allowed`,
  `unsafe_value`).

> **Independence margin (post-audit hardening):** the engine (`culori.wcagContrast`) and the oracle
> (from-scratch WCAG) agree to within **~2e-4** across thousands of pairs, so `CONTRAST_TOL` was
> tightened from 0.02 → **0.005** — a real verifier over-accept of >0.005 below floor would now be
> flagged (relevant because accepted themes sit *at* the floor). `C2`'s reachability scan is now a
> falsifiable `toBe(0)`; `C4` asserts `ring` *tracks* primary's hue (not merely ≠ base).
>
> **Disclosed limit:** the `chroma ≤ cap` half of C1 is *un-stressed by fuzz* — the compiler clamps
> chroma to the cap **before** emit (`Math.min(color.c, chromaCap)`), so no normal compile can produce
> an over-cap value (observed max 0.244/0.272 vs cap 0.3). The chroma-cap invariant is therefore a
> *clamp guarantee*, proven by the **C5 tamper** (an over-cap value *is* rejected), not by the fuzz.

### D. Format-contract golden net — **PASS** (mutation-confirmed)

`tests/verify/D-format-golden.test.ts` (7 tests).

- Every `hsl`-emit var serializes as a **bare triple** (`"180 100% 98.115%"`), never hex, never
  `hsl(...)`-wrapped — verified on the **re-derived** serialization path (neutral-resurface,
  accent-recolor), not just the verbatim-base copy. `radius` emits a plain number. A committed render
  golden pins the exact CSS.
- **Mutation check (performed):** breaking `emitValue`'s hsl branch to emit `hsl(<triple>)` turned
  **both** my Group-D net (4 tests) **and the engine's own** `compile-golden` + `render` goldens
  (3 tests) **RED**; reverted via `git checkout`. The net demonstrably fails when the silent-corruption
  contract breaks.

### E. The cascade actually wins — **PASS** (real chromium, not jsdom)

`tests/verify/E-cascade.test.ts` (11 tests; Playwright + chromium 1223).

- **E1 — cascade:** a shadcn-style reference gallery defines its **own** base `:root`/`.dark` rules;
  injecting the themed `<style>` at the **end of `<head>`** makes `getComputedStyle` return the
  **themed** value — proven in **both light and dark** via next-themes-style `.dark` toggling
  (dark-selector specificity parity + source order). Expected RGB is computed by the **independent
  oracle** (hsl→sRGB), not read back from the browser. A **counter-control** proves that *start-of-head*
  placement **loses** — end-of-head is load-bearing.
- **E2 — fail-open:** every `FailOpenReason` (`no_nonce`, `pointer_miss`, `pointer_disabled`,
  `artifact_missing`, `hash_mismatch`, `unsafe_value`) returns `{ tag: null }` via distinct setups;
  the happy path returns a nonce'd `<style>`.
- **E3 — renders base:** in the browser, a null tag → nothing injected → the **base** design renders;
  a happy-path tag → themed.

### F. Full session via MockAgent — **PASS**

`tests/verify/F-session.test.ts` (7 tests, zero real LLM).

- **F0 (data-model finding):** an acknowledged draft holds colors as **`Oklch` objects** `{l,c,h}` —
  re-parsing the draft **rejects** (`OklchColor` expects a string) — so the pipeline compiles the draft
  **directly**. (See Findings #2.)
- **F1:** three accumulating acks compose into one draft; **one** publish ships it (one audit row;
  artifact reflects all three changes).
- **F2:** the removal sentinel surfaces diff `kind:"removed"` with `to = defaultSeeds.radius` (`"8"`).
- **F3:** a no-op delta → `kind:"no_change"`; `diffSpecs` length 0.
- **F4:** `resetToPublished` reloads the **stored** StyleSpec and recompiles **byte-identical** (same
  artifact hash) after the draft had wandered — a true functional read path, not a lossy decompile.
  (Post-audit: the wander now uses `radius` rather than `density` — `density` has zero output roles, so
  it didn't move the artifact and the byte-identity assertion wasn't load-bearing.)
- **F5:** a **wall**-rejected turn mid-session leaves the draft clean; the next turn builds on the last
  good draft.
- **F6 (added post-audit):** a wall-**valid** but **verifier**-rejected turn (`neutral:
  oklch(0.45 0.18 30)` → `contrast_floor`) also leaves the draft byte-identical — closing the
  "rejected turn clean" keystone for the *verifier*-reject branch of `runTurn`, which F5/B8 (wall
  rejects only) did not exercise.

---

## Findings — engine bugs vs test gaps

**No engine invariant violations were found.** Every cross-cutting property holds. The items below are
behavioral characterizations and robustness notes, plus full disclosure of test bugs found *in my own
tests* during development (all fixed; none were engine bugs).

### Behavioral characterizations (not bugs)

1. **`compile()` ships accepted themes at the AA floor.** `minContrastMargin ≈ 0.000` — the
   minimum-perturbation repair lands `muted-fg` (minimum-legible) right at the 3.0/4.5 floor. The
   independent oracle confirms these sit **at or above** the floor (agreement with culori within
   ~0.001). Not a bug, but worth knowing: there is essentially no headroom, so any future change to the
   contrast math or rounding could push a shipped theme fractionally under floor — the verifier (and
   this fuzz) is the safety net.

2. **The `(foreground, background)` root-pair hard-reject is unreachable via legal seeds.** Because
   `background`'s L is profile-anchored to the mode extreme (light→near-white, dark→near-black), no
   `neutral` seed can drag the root pair below floor. It is a **defensive net** (verified to fire when
   forced). General `contrast_floor` rejections *are* reachable (other pairs), so the gate is exercised.

3. **`compile()` is not defensive against a non-canonical (null-bearing) draft.** Its contract input is
   the post-merge, null-free, canonicalized draft (the session always canonicalizes before compiling).
   Fed a raw `{ radius: null }` directly, it treats the present null as "radius touched" and emits a
   spurious `--radius`. Not a bug (out-of-contract input), but a sharp edge.

### Robustness note worth surfacing to the team

4. **Drafts are parsed StyleSpecs (Oklch objects); never re-parse a colored draft.** A draft holds
   colors as `{l,c,h}`, so `parseSpec(coloredDraft)` **rejects** (the wall expects strings). The
   pipeline correctly compiles the draft directly. **However, the engine's own e2e test
   (`apps/control-plane/test/theming/authoring/e2e.test.ts`) re-parses `session.draft` before
   compiling** — which works *only because that test's draft is color-free* (`{ radius: 16 }`). If that
   pattern is copied into a real publish-from-session path for a colored draft, `parseSpec` will reject
   it. Recommend compiling the acknowledged draft directly everywhere (as `runTurn` already does).
   *Classification: not an engine bug; a latent footgun in example code.*

### Test bugs found and fixed in this pass (disclosure)

All were defects in **my verification tests**, caught by the suite during development and fixed; none
indicated an engine fault:

- **A3:** initially fed `compile` a null-bearing draft (out-of-contract) → routed through
  `canonicalize` as the session does (surfaced characterization #3).
- **C5:** chose `hsl "320 100% 50%"` expecting OKLCH chroma > 0.3, but it is 0.2755 (in-gamut); used
  magenta `"300 100% 50%"` (≈0.322) instead.
- **E1/E3:** stale expected base-accent values after changing the gallery fixture.
- **F1/F4/F5:** compared color-bearing drafts to **string** expectations and re-parsed a colored draft
  (surfaced #2/#4); switched to structural assertions and direct compilation.

---

## Determinism-boundary verdict (A + C + the B draft-untouched check)

**Sound.** `compile` is byte-deterministic in-process, across processes (mutated locale/TZ), and over
random valid specs, with canonicalize-equivalent inputs converging (A). The verifier never accepted an
invariant-violating theme across ~400 independently re-derived accepts, and rejects tampered output for
every failure code (C). No rejected turn — wall or verifier — mutated the draft (B8). The wall→
deterministic-core boundary, and the verifier-as-gate that the design rests on, hold under adversarial
input.

## Adversarial audit

Five independent agents (fresh context — deliberately *not* forks of the author) re-derived the
load-bearing numbers, ran the suite, hunted for vacuous/over-claiming tests, and critiqued coverage
against the brief. **No agent found an engine bug** (every concern returned `isEngineBug: false`),
which corroborates the headline verdict from an outside perspective.

| Auditor | Verdict | Key independent confirmations |
|---|---|---|
| Oracle independence | **sound** | `_oracle.ts` has zero imports; `culori` is *not even resolvable* from `tests/verify`; recomputed every anchor from scratch (white/black=21, `#767676`=4.5422, red OKLCH chroma 0.25768); both OKLab matrices are canonical Ottosson |
| Determinism + invariants | minor-concerns | A2 is a *genuinely separate* OS process and a 1-char drift breaks it; generator is diverse (248/250 distinct, never touches locked `primary`); engine-vs-oracle contrast disagreement **max 1.9e-4**; "0 verifier gaps" true for the corpus |
| Wall + session | minor-concerns | all 6 `WallFailureCode`s map 1:1 to the engine; positive controls real; B8 byte-compare catches a deliberate mutation; F drives the *real* state machine (not reimplemented); F0 re-parse-rejects claim confirmed |
| Golden + cascade | **sound** | reproduced the D mutation independently (4 RED, reverted clean); E launches *real* chromium (not skipped); `hash_mismatch`/`unsafe_value` hit genuinely distinct guards; counter-control proven non-vacuous |
| Completeness | minor-concerns | mapped every brief bullet A–F to a covering test; confirmed engine source pristine before & after |

**Concerns raised → addressed** (all test-side; commit *harden suite per adversarial audit*):

| Concern (auditor) | Severity | Resolution |
|---|---|---|
| `CONTRAST_TOL=0.02` ~100× looser than the ~2e-4 disagreement; could absorb a real over-accept in the at-floor regime | medium | tightened to **0.005** |
| F4 byte-identity non-discriminating (`density` wander doesn't move the artifact) | medium | wander now uses **`radius`** + assert wandered hash ≠ published hash |
| "rejected turn clean" proven only for **wall** rejects, not **verifier** rejects | low | added **F6** (verifier-reject draft-clean) |
| C2 first test ends in always-true `>= 0` | low | now falsifiable `toBe(0)` |
| C4 `ring` only asserted ≠ base (could be a stale/coincidental copy) | low | now asserts `ring` **tracks primary's hue** across two primaries |
| Oracle self-test tolerances loose; only trivial contrast anchors | low | tightened to 3–4 dp; added third-party **WebAIM `#595959`=7.0**, rgb()/3-hex, and a `chromaOf` round-trip check |
| B4/B6 asserted code but not path | low | added path assertions |

**Disclosed residual limits (not fixed; by design or low-value):**

- **Chroma-cap is un-stressed by fuzz** — the compiler clamps chroma pre-emit, so C1 can never see an
  over-cap value; the invariant is a *clamp guarantee* proven by the C5 tamper, not the fuzz. (Noted in
  Group C and Findings.)
- **A3 key-insertion-order test is structurally guaranteed** — `compile` reads the draft by named
  property, so order *cannot* affect output; the test re-confirms a structural property rather than
  catching a reachable bug. Kept as a guard against future refactors.
- **Fuzz space is a constrained slice** — `randomAcceptedDeltaJson` never moves the locked `primary`,
  uses only the single `sans` font id, and keeps chroma below the cap. "Zero verifier gaps over ~400
  accepted themes" is true *for this generator*, not for arbitrary prompt-shaped input. A future
  expansion (a moved-primary arm, an AAA-tier manifest to make the root-pair reachable, near-cap
  chroma) would broaden coverage.
- **One non-reproducing observation:** one auditor saw a *single* `verify` return `ok:false` for an
  input that otherwise verifies in 50+ cold compiles and ~20 reruns. The most likely cause is that a
  *different* auditor was mutating `oklch.ts` (the Group-D mutation) in the **same working tree at an
  overlapping time** — a concurrency artifact of running five agents against one checkout, not a
  determinism violation. Group A's 100×-in-process + fresh-process determinism (byte-identical) stands
  as the authoritative evidence that `compile`/`verify` are pure. Flagged for awareness; not
  reproducible in isolation.
