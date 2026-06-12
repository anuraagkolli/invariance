# Phase 7: Scanner Role Clustering + Role-Tier Emission

> Executed via superpowers:subagent-driven-development in-session. Decisions recorded here; task prompts carry implementation detail.

**Goal:** the Scanner classifies extracted design values into the v6 role vocabulary deterministically and emits a **theme.json v2 initial theme** — `theme.roles` (clustered values) + `theme.slots` (slot tokens as `var(--inv-<role>)` references where the observed value belongs to a role cluster, literals otherwise) — so a freshly scanned app lands directly on the two-tier token system.

**Where the role tier lives:** the scanner already emits `invariance.theme.initial.json` consumed via the provider's `initialTheme`. v6 upgrades that artifact to v2; the runtime writes `:root` from it. No CSS file emission needed.

**Clustering (deterministic, no LLM in this phase):**
- Collect color `ObservedValue`s across slots with their property kind (bg/text/border, via `roleForCssProperty`).
- Cluster near-identical values in OKLCH (tolerances ~ΔL 0.03, ΔC 0.03, Δh 8°) — `#ffffff/#fefefe/#fafafa` is one cluster.
- Assign roles by heuristic: page/body background → `surface-0`; remaining bg clusters ordered by lightness-distance from surface-0 → `surface-1/2`; low-chroma text clusters by contrast vs surface-0 → `text-primary` (highest), `text-secondary`; border-kind clusters → `border`/`border-strong`; the most-used high-chroma cluster (c > 0.07) → `accent` (with `accent-contrast` contrast-solved via core's `solveText`); fonts: most-used family → `font-body`, distinct heading family → `font-display`; radius mode value → `radius-base`.
- Unassignable clusters stay slot-literals with a report warning. The LLM ambiguity/naming pass from DESIGN 1.3 is deferred to a follow-up — the deterministic pass must fully handle the scanner's fixture app.

**Emission changes:** `slotVariableInitialValues` entries whose value matches a role cluster become `var(--inv-<role>)`; the v2 initial theme carries `roles` + `slots`; config emission gains the v6 relational `design.constraints` block (contrast `>= 4.5`, `accent_chroma_max 0.25`, `font_registry: default`) alongside the existing locked defaults.

**Exit (CLAUDE.md phase 7):** scanning the fixture app (`packages/scanner/src/__fixtures__/simple-app` — the realistic literal-valued scan target; the live demo app is already hand-tokenized) emits the role tier + slot var() refs; round-trip: the emitted v2 initial theme passes `ThemeJsonV2Schema` and `verifyV2`.
