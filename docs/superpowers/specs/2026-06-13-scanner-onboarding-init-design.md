# Scanner Onboarding — `invariance init` end-to-end adoption flow

**Date:** 2026-06-13
**Status:** Design — approved to write up, pending user review before planning
**Topic:** Close the gap between "scanner wraps source" and "developer's app is fully set up like the Nebula demo," and prove it by scanning a clean Nebula.

---

## 1. Problem

The scanner (`packages/scanner/`) is a complete one-shot source-rewriting migration tool: it discovers a Next.js app, extracts colors/fonts/spacing/structure via ts-morph, LLM-names slots/sections/text (deterministic fallback without a key), deterministically clusters colors into roles, rewrites JSX to insert `<m.slot>/<m.page>/<m.text>` wrappers and `var(--inv-*)` refs, emits `invariance.config.yaml` + `invariance.theme.initial.json`, and injects `providers.tsx` + patches `layout.tsx`.

It is **not** a complete developer *onboarding workflow*. Three gaps stand between scanner output and a runnable, themeable app equivalent to `apps/demo`:

1. **No `:root` default tokens** — a scanned app wraps cleanly but renders unstyled, because the `var(--inv-*)` references the rewriter inserts have nothing defining them. The demo's `globals.css` `:root` block is generated separately by `apps/demo/scripts/gen-default-tokens.mjs` and pasted in by hand.
2. **No SSR theme inlining** — `injectProvider()` wraps `{children}` but never inlines the first-paint `:root` block (DESIGN.md:295), so a themed app would flash unthemed HTML on load.
3. **No "choose your invariants" step** — the scanner hardcodes every slot/page to `level: 0` (fully locked) and leaves a comment telling the developer to run `invariance-unlock` by hand. There is no guided step to select what's customizable.

And the four CLIs (`scan`, `check`, `unlock`, `migrate-theme`) are disjoint — there is no single command that runs the journey. Finally, the current demo was hand-built (commit `f6433ab`; scanner artifacts deleted in `6ff1e96`), so **the scanner's output has never been validated against the demo's end-state.**

## 2. Goal

A developer points one command at their app and ends with a runnable, themeable app — the SDK-adoption equivalent of `apps/demo`. We prove it by scanning a clean (unwrapped) Nebula and asserting functional parity with the existing demo.

## 3. Decisions (resolved in brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| **Target end-state** | **SDK-adoption parity** | The scanned app runs, themes, persists locally (cookie-mirror + localStorage), and the end-user `CustomizationPanel` works. Excludes demo-only backend: `/dev` dashboard, dev-config overlay, theme-history store, `/api/llm` proxy, durable server storage. Those are app-specific infrastructure, not SDK adoption. |
| **Invariant selection** | **LLM-advisory + deterministic presets, human ratifies** | The interactive step *recommends* a level per slot but never writes it; the human's confirmed choice drives the existing deterministic `applyUnlock`/`unlockPage` presets. Honors DESIGN.md:93 ("the LLM never picks values; it labels them") and DESIGN.md:312 (permission engines out of scope). Works with zero API key. |
| **Success bar** | **Functional parity** | Scanned clean-Nebula compiles, renders themed on first paint (no flash), all 10 packs apply AA-passing, "sidebar blue" contrast-solves, `invariance-check` passes, visual-QA green. Not byte-identical to the hand-built demo (that would over-fit the scanner). |

## 4. Verified codebase facts (so the implementer does not repeat earlier design errors)

These were checked against source during design — they correct intuitive-but-wrong assumptions:

- `compileTheme(spec: StyleSpec, constraints)` (`packages/core/src/compiler/compile.ts:27`) consumes a **StyleSpec (design intent)**, not a theme. The scanner produces a `ThemeJsonV2`. **You cannot `compileTheme()` the clustered scanner output.**
- The correct primitive for "theme → CSS" already exists: `themeToCssEntries(theme: ThemeJsonV2): Array<[string,string]>` (`packages/core/src/runtime/apply.ts:20`) and `renderThemeCss(theme, config)` (`packages/core/src/runtime/ssr.ts:45`, builds the `:root{…}` block, exported from `index.ts`).
- `apps/demo/scripts/gen-default-tokens.mjs` compiles a **hand-authored StyleSpec** to a full role set and prints `k: v;` lines with its own `.map().join()` — i.e. it reimplements the entries→CSS formatting that `themeToCssEntries` already does. It should be refactored onto the shared formatter, not duplicated again in the scanner.
- `variable-rewriter.ts:185-199` rewrites **both** arbitrary and named Tailwind classes to `${prefix}-[var(${varName})]` — i.e. everything becomes `bg-[var(--inv-*)]` **arbitrary-value** syntax, which Tailwind JIT resolves with **no config**. A tailwind-emitter is therefore unnecessary for scanner output (the demo needs `theme.extend` only because it was hand-authored with named utilities like `bg-surface0`).
- `migrate.ts` already emits `providers.tsx` with `InvarianceProvider` + `CustomizationPanel` + `apiKey={process.env.NEXT_PUBLIC_ANTHROPIC_DEV_API_KEY ?? ''}` (`buildProvidersSource`, `migrate.ts:44`) and wraps `{children}`. It does **not** inline SSR `<style>` (no `renderThemeCss`/`themeFromCookieHeader`/`inv-ssr-theme` anywhere in the file).
- `scanner-agent.ts` is hard-wired to level 0: the prompt forbids non-zero levels (`:38`), the normalizer force-sets `level: 0` (`:257-272`), and `buildFallback` (`:141-160`) emits no level recommendation. There is **no** existing deterministic level-recommendation path.
- Deterministic unlock presets exist: `applyUnlock`, `unlockPage`, `VALID_SECTIONS` in `packages/scanner/src/unlock/presets.ts`.
- The `analyze()` / `writeMigration()` split in `migrate.ts` is the seam: `analyze()` mutates an in-memory ts-morph project and returns a diff; `writeMigration()` commits. The interactive step inserts between them; the new emitters extend the write path.

## 5. The `invariance init` experience

```
$ invariance init
  ① Discover   → app router, pages, layout.tsx, tailwind.config, package name  (discover.ts, existing)
  ② Analyze    → extract + LLM-name (deterministic fallback); in memory, nothing written  (analyze(), existing)
  ③ Advise     → per slot/page, a recommended level + one-line rationale (Unit C):
                   deterministic heuristic by default (preserve:true → "keep locked";
                   content → "F1 recolor / F3 reorder"); optional LLM pass refines rationale text only
  ④ Confirm    → interactive prompts: accept-all or override each level. Human is the gate.
                   Confirmed choices drive applyUnlock/unlockPage (deterministic).
  ⑤ Write      → wrapped source + var(--inv-*) refs                    (writeMigration, existing)
                   + globals.css :root baseline                         (Unit A: css-emitter)
                   + layout.tsx SSR <style> inlining                    (Unit B)
                   + invariance.config.yaml (levels from ④) + theme.initial.json  (existing)
                   + providers.tsx                                      (existing)
  ⑥ Verify     → run invariance-check; report "✓ run pnpm dev"
```

`invariance-scan` remains as the lower-level, non-interactive command (CI / scripted use). `init` is the guided flow that composes the scanner library functions.

## 6. Units

Each unit is independently testable. Build order: **E → A → B → C → D** (E as a failing acceptance test first; assertions tighten as units land).

### Unit A — css-emitter (the "make it render" fix)
- **What:** `packages/scanner/src/emit/css-emitter.ts` — format the scanner's `ThemeJsonV2` initial theme through `themeToCssEntries()` into the `:root` block, and write/patch it into the discovered `globals.css` (under a generated-tokens marker comment, idempotently).
- **Self-consistency:** the rewriter only references roles/slots the scanner observed, so a partial `:root` is complete *for this source*. A later whole-app theme (Designer → `compileTheme` → full role set) fills the rest at runtime via `applyTheme`.
- **Shared formatter:** refactor `apps/demo/scripts/gen-default-tokens.mjs` to wrap its compiled roles into a synthetic `ThemeJsonV2` and call `themeToCssEntries`, so demo and scanner share one CSS formatter and cannot diverge.
- **Cut:** no tailwind-emitter (see §4).
- **Where:** `emit/css-emitter.ts` (pure, golden-tested); wired into `writeMigration()`.
- **Depends on:** existing cluster/theme emission + `@invariance/core` `themeToCssEntries`.

### Unit B — SSR `<style>` inlining
- **What:** extend `injectProvider()` (`migrate.ts`) to patch `layout.tsx` with `themeFromCookieHeader()` → `renderThemeCss(theme, config)` → inline `<style id="inv-ssr-theme">` in `<head>`, matching `apps/demo/src/app/layout.tsx`. Provider/`providers.tsx` emission already exists — leave it.
- **Where:** `migrate.ts` `injectProvider()` (+ a focused helper); idempotent.
- **Depends on:** `@invariance/core` `renderThemeCss` / `themeFromCookieHeader`. Independent of A.

### Unit C — interactive unlock (advisory LLM, deterministic mutation)
- **What:** a step between `analyze()` and `writeMigration()`:
  - **Advisor (`packages/scanner/src/init/advise.ts`):** produce a recommended level + rationale per slot/page. Default is a **deterministic heuristic** (chrome `preserve:true` → locked; content → F1/F3). An *optional* LLM pass refines only the rationale text. The recommendation is **advisory annotation — never written as the slot's level**.
  - **Confirm (`packages/scanner/src/init/confirm.ts`):** interactive CLI prompts (accept-all / per-slot override). Confirmed choices drive the existing `applyUnlock`/`unlockPage` presets, which produce the `invariance.config.yaml` levels.
- **Untouched:** `scanner-agent.ts` stays names-only, level 0. The advisor is a separate module so the naming agent's purity is preserved (DESIGN.md:93).
- **Depends on:** `analyze()` output + `unlock/presets.ts`. Orthogonal to A/B.

### Unit D — `invariance init` orchestrator
- **What:** `packages/scanner/bin/invariance-init.ts` + `packages/scanner/src/init/run.ts` sequencing ①–⑥, using `analyze()` → Unit C → `writeMigration()` (with A + B emitters) → `runCheck()` → next-steps report. Add the `invariance-init` bin to `package.json`.
- **Depends on:** A, B, C.

### Unit E — clean-Nebula acceptance harness (build first)
- **What:** `packages/scanner/__fixtures__/nebula-clean` — an unwrapped Next.js Nebula authored with **literal colors / inline styles / arbitrary Tailwind, no `var(--inv-*)` and no token-named utilities** (the realistic "before"), derived by stripping the demo's wrappers and restoring literal values. Reference end-state is the existing `apps/demo`.
- **Two test layers:**
  1. **Fast integration test** (vitest, colocated): copy the fixture to a temp dir, run `init` with no API key (deterministic naming), assert: emitted artifacts present; output type-checks/compiles; `invariance-check` passes; `themeToCssEntries(initialTheme)` yields AA-passing tokens (reuse `scripts/check-contrast.mjs`).
  2. **CI-only Playwright visual-QA** (per CLAUDE.md "CI only"): `next build && next start` the scanned temp copy; assert no-flash first paint, all 10 packs apply AA-passing, "make the sidebar blue" contrast-solves.
- **Depends on:** nothing (stub assertions first; fill in as A–D land).

## 7. In / out of scope

**In:** the six emitted artifacts (wrapped source, `globals.css` `:root`, `layout.tsx` SSR, `providers.tsx`, `invariance.config.yaml` with chosen levels, `theme.initial.json`). `CustomizationPanel` works out of the box for the 10 keyless packs; NL prompts work when the developer supplies an LLM endpoint/key via env.

**Out (per scope decision):** `/api/llm` proxy (server-side model pinning), `/dev` dashboard + dev-config overlay, theme-history store, durable server-side theme storage, **F4 component-swap registration** (scanner emits an empty `componentLibrary` stub the developer fills — swap targets cannot be auto-generated).

## 8. Known seams (note, do not solve here)

- Emitted `providers.tsx` hardcodes `NEXT_PUBLIC_ANTHROPIC_DEV_API_KEY` (browser-direct Anthropic), whereas the demo default is qwen2.5 via the out-of-scope `/api/llm` proxy. Packs work keyless; NL prompts need the dev's key. Flag in `init`'s next-steps output.
- Scanner is one-shot by design (idempotency guard, `migrate.ts:184`). Incremental re-scan (new page added later) is out of scope; the dev wraps manually + `unlock`.
- Greenfield apps (no literals to extract) are out of scope; `init` targets an existing app with observable design values — which the clean Nebula is.

## 9. Coding conventions (project)

Strict TS, named exports, no `any`, async/await, single quotes, no semicolons, kebab-case files, colocated tests, comments explain why. New emitter/advisor functions are pure where possible and golden-tested; agent prompts live in template files beside their agent. Do not regress the suite (schema 11 + core 396 + scanner 84 + snippet 55).

## 10. Acceptance criteria

1. `invariance init` run against `__fixtures__/nebula-clean` produces an app that builds and runs.
2. First paint is themed (SSR `:root` inlined) — no unthemed flash.
3. All 10 theme packs apply with AA-passing contrast; "make the sidebar blue" contrast-solves.
4. `invariance-check` passes on the output.
5. The interactive step lets the developer set per-slot/page levels; the LLM never writes a level; zero-key runs still produce sensible advisory defaults.
6. `gen-default-tokens.mjs` and the scanner share one CSS formatter (`themeToCssEntries`).
7. Full existing test suite stays green; new units have colocated tests.
