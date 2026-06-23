# Tier-A Demo — Part 1 Mechanism Findings (2026-06-23)

Measured on the real `@invariance/theming` pipeline (probe manifest = `SHADCN_CAN` with `locks` removed,
light mode). Pinned as regressions in `test/mechanism-probe.test.ts`.

## Measurements

- **(a) Surface propagation — ANCHORED.** A mid-L `neutral` (`oklch(0.55 0.08 300)`) moves
  `--background` lightness only **100% → 97.8%**. Surfaces are pinned to the ramp's anchorL; `neutral`
  contributes hue/chroma, not lightness. → **The "dramatic full-screen saturated surfaces" contrast
  beat is not achievable.**
- **(b) Mid-L `primary` — clears AA, fails AAA.** `primary-fg/primary` contrast across an oklchL sweep:
  0.45→7.83 (clears AAA), **0.50→6.29, 0.55→5.07, 0.60→5.11, 0.65→6.25** (all clear AA 4.5, all fail
  AAA 7.0). → **A text-contrast rejection on a brand seed is reachable ONLY at AAA**, robustly in the
  oklchL 0.50–0.65 band (valley ≈ 5.07:1). It recolors a button, not the screen.
- **(c) Saturated `neutral` @ AA — DOES reject.** `oklch(0.45 0.18 30)` → `verify` rejects
  **`contrast_floor` on `muted-fg/muted` (large-text 3:1)**. → **An AA contrast rejection exists** — the
  story is "muted/secondary text would become illegible," at the realistic AA tier, no AAA needed.
  (Not the visceral "body text" story — maximize-contrast body/card text clears AA at ≈4.58 for any
  surface, so a 4.5 body-text rejection is unreachable at AA by construction.)
- **(d) Scripted SUCCESS colors clear AAA in light.** Dark indigo (`oklch(0.35 0.12 270)`) →
  primary-fg/primary **11.6:1**; warm-light surfaces → foreground/background **20.3:1**. Both clear AAA
  (and AA) comfortably in light. (Dark-mode clearance for AAA is unverified — would require Task 4.)

## The three-way decision

| Option | Fires? | Story | Costs |
|---|---|---|---|
| **contrast-via-surface @ AAA** | ❌ no | full-screen | impossible — surfaces anchored (a) |
| **contrast-via-`primary` @ AAA** | ✅ (AAA only) | "button text illegible" | blanket-AAA reads contrived to a technical buyer; recolors a button (modest visual); needs Task 4 (AAA dark-base constructibility + both-mode success clearance) |
| **lock-led @ AA** (+ AA muted-fg contrast) | ✅ deterministic | "platform froze the error color" (hero) + "muted text would be illegible" (secondary) | contrast secondary is the muted/large-text story, not body text; both at the realistic AA tier |

**Recommendation: lock-led @ AA.** The `seed_locked` wall rejection is deterministic, mode-independent,
and AA-realistic — the strongest on-camera anchor. And finding (c) means we *also* get a credible
contrast beat at AA (muted-text legibility) without the AAA-contrivance or the Task-4 dark-mode risk.
AAA's only marginal gain over this is a "button text" contrast story, bought at the cost of looking
more restrictive than the standard requires + a dark-mode viability gate.

## Decision

Chosen: **lock-led at AA (+ AA muted-text contrast secondary)** — user decision, 2026-06-23.
Rationale: surfaces are anchored (a), so the full-screen contrast beat is impossible; a body-text AA
rejection is unreachable by construction; AAA would buy only a "button text" story at the cost of
reading as contrived to a technical buyer plus a dark-mode viability gate. Lock (`seed_locked`) is the
deterministic, mode-independent, AA-realistic hero, and finding (c) gives a credible AA contrast beat
(muted/secondary text legibility) for free. Tier stays **AA**, so the standard shadcn base already
passes `refBasePassesTier` — no AAA base to build.
- **Hero:** `seed_locked` — `destructive` is platform-locked; the tenant cannot recolor the error state.
- **Secondary contrast beat:** a saturated `neutral` (e.g. `oklch(0.45 0.18 ~30)`) → `contrast_floor` on
  `muted-fg/muted` (large-text 3:1): "muted/secondary text would be illegible."
- **Success beats:** dark indigo `primary` + warm-light `neutral` (both clear AA trivially in both modes).

Dark-mode gate (Task 4): **N/A** — lock-led-AA is fully de-risked by the light probe (the wall rejection
is mode-independent; AA success clearance ≈ 4.58 ≥ 4.5 holds in both modes).
