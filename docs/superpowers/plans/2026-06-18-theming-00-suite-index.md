# Governed Theming Pipeline — Implementation Plan Suite (Index)

**Date:** 2026-06-18
**Spec:** `docs/superpowers/specs/2026-06-17-governed-theming-pipeline-design.md`
**Shared interface ledger:** `docs/superpowers/plans/2026-06-18-theming-00-interface-ledger.md`
**Status:** 7 plans, 69 TDD tasks. Self-reviewed (placeholders clean, interfaces consistent, spec coverage complete).

This suite implements the spec as seven standalone, working-and-testable plans, decomposed along the
§11 build order. Each plan is independently reviewable and ends every task with a green test + commit.
All seven were authored against one shared **interface ledger** (plan-00) so cross-plan type/function
names match verbatim.

## Substrate decision (redirectable)

The spec is greenfield; this is where it maps onto packages. **The pure deterministic core lives in a
new shared package `@invariance/theming`**, imported by both planes — directly embodying the spec's
"build the applier once, shared." Control-plane stages live in `apps/control-plane`; the in-browser
scan SDK and data-plane applier re-export live in `packages/client`; the SSR delivery adapter is wired
at the host. If you'd package it differently, it's a path find-replace — flag it before execution.

```
packages/theming/src/{roles,manifest,spec,session,profile,compile,verify,artifact}   # plane-agnostic core
apps/control-plane/src/theming/{scan,publish,authoring}                              # control-plane stages
packages/client/src/theming/{scan-sdk, …}                                            # data-plane SDK + applier re-export
```

## The plans

| # | Plan | Deliverable (working + testable) | Spec sections | Tasks |
|---|------|----------------------------------|---------------|-------|
| 01 | [Determinism core](2026-06-18-theming-01-determinism-core.md) | role graph + manifest schema + StyleSpec wall + merge + diff — validate/parse/merge/diff with **zero LLM, zero compiler** | §3, §4.1–4.3, §6 | 14 |
| 02 | [Compiler](2026-06-18-theming-02-compiler.md) | ramp profile + `compile(draft, manifest) → CandidateTheme`, golden-filed on the can | §3.1, §4.5, §12 (profile) | 8 |
| 03 | [Verifier](2026-06-18-theming-03-verifier.md) | `verify(theme, manifest) → Verdict` (re-parse, trust nothing) + adversarial suite | §4.6 | 4 |
| 04 | [Artifact + applier](2026-06-18-theming-04-artifact-applier.md) | `ThemeArtifact`, `renderStyleText`/`styleTag`/`applyTheme`, `Pointer` — cascade-win, nonce, cold-start | §7 | 11 |
| 05 | [Publish + storage + session](2026-06-18-theming-05-publish-storage-session.md) | storage interfaces, publisher (write-order + retention), session state machine + **MockAgent zero-LLM e2e** | §4.4, §8, §9, §12 | 11 |
| 06 | [Scan + Scanner](2026-06-18-theming-06-scan-scanner.md) | `ScanPayload`, in-browser scan (CSSOM source-of-truth), Scanner → manifest, the "can" path | §1.1, §5 | 10 |
| 07 | [LLM stages + delivery](2026-06-18-theming-07-llm-and-delivery.md) | Gatekeeper/Designer (qwen via Ollama) + Next.js SSR delivery adapter, fail-open | §1.2, §1.3 | 11 |

## Execution order & dependencies

The build order is **01 → 02 → 03 → 04 → 05 → 07**, with **06 runnable any time after 01**:

```
01 (core, creates @invariance/theming)
 ├─ 02 (compiler)      needs 01
 │   └─ 03 (verifier)  needs 01 + CandidateTheme(02)
 │       └─ 04 (artifact/applier)  needs 01 + CandidateTheme(02) + isSafeCssTokenValue(03)
 │           └─ 05 (publish/storage/session)  needs 01–04
 │               └─ 07 (LLM + delivery)  needs 01, 04, 05
 └─ 06 (scan/scanner)  needs 01 only (produces manifests; independent of 02–05, 07)
```

This DAG is why Plan 04's review flagged two "residuals" — they are **ordering facts, not defects**:
Plan 04's tests assume `packages/theming` exists (Plan 01 owns it) and that `isSafeCssTokenValue`
ships from Plan 03. Run in order and both resolve. (One cosmetic, harmless item: Plan 04's
`buildArtifact` sets `meta.contrastFloor` to the tier string while some fixtures use a number; `meta`
is `z.unknown()` and applier-ignored, so it's internally consistent per task.)

## Spec coverage map

Every spec section maps to a task: §3 → 01; §4.1–4.3 → 01; §4.4 → 05; §4.5 → 02; §4.6 → 03; §5 → 06;
§6 → 01; §7 → 04; §8 → 05 (+ golden files in 02/03/04); §9 → 05; §1.1 → 06; §1.2 → 07 (+ session in 05,
deterministic stages in 01–04); §1.3 → 07 (+ applier in 04); §11 → this order; §12 → profile (02),
orchestration + failure-UX (05), storage + delivery (05/07). §10 (deferred) is intentionally not built.

## Milestones

- **After 03:** the entire valuable half is provable with zero LLM (hand-written StyleSpecs → compiled
  → verified, golden-filed) — the determinism-boundary payoff.
- **After 05:** full authoring session end-to-end via MockAgent (merge → compile → verify → preview →
  acknowledge → publish, reset, three outcomes) — still zero real LLM.
- **After 07:** real prompts → verified themes, and end users get SSR-themed pages, fail-open.
