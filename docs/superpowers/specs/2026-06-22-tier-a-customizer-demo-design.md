# Tier-A Customizer — Recorded Sales Demo (Design)

**Date:** 2026-06-22
**Status:** ✅ **BUILT** (`apps/tier-a-demo`, branch `tier-a-demo`) — but the demo **evolved past this
document**; see the as-built note below.
**Depends on:** the verified `@invariance/theming` engine + control-plane theming stages
(`docs/DESIGN.md`, `docs/verify/2026-06-21-engine-verification.md`).

> **This is the first product-facing slice and it is a *recorded sales demo*, not production
> substrate.** Its only job is to make an enterprise prospect say *"I want that."* It is hosted and
> **user-driven (the user records it)**, faking everything that isn't the jaw-drop. The real product
> (the multi-tenant studio with a server-side session, audit, SSR delivery, real LLM) is **"Plan-08,"
> sketched in Appendix A** — same seams, built once a prospect's needs say what's load-bearing.
> Building that substrate now would be the enterprise-first trap: production plumbing before validated
> demand.

---

## Status — AS BUILT (2026-06-23)

This document is the **original design** (a lock-led, AA, color + radius demo). The built demo kept its
spine — the magic loop, the governance-refusal hero, the two-tenant side-by-side — but **evolved in two
big ways** in response to review. Treat the sections below as design history; the current source of
truth for what exists and how to run it is **`apps/tier-a-demo/README.md`**.

1. **"Whole different vibe," not a recolor.** A single prompt now shifts the *entire design language* —
   color + radius **+ density-driven spacing + typography (real fonts) + elevation + border + layout
   structure**. This required an **append-only engine v2**: `iv-roles-2` / `iv-profile-2` (a spacing
   scale + resolved font stacks) and a new `target_size_floor` verifier rule (WCAG 2.2 §2.5.8, 24px) —
   with `iv-roles-1` / `SHADCN_CAN` left byte-identical (the 117-test oracle still passes, no regen).
   Governance-bearing axes (spacing, fonts) are engine-emitted; purely aesthetic axes (shadow, border,
   font-size) are canvas-applied. See [[emit-governed-axes-only]] / `docs/DESIGN.md` scope.
2. **Named client brands for a concrete use case.** The two tenants are **Stripe** (violet, Geist,
   rounded, roomy, sidebar) vs **Bloomberg** (amber + green, IBM Plex Mono, sharp, dense, top-nav
   terminal) — framing the *embedded-analytics-vendor* pitch ("your client wants the dashboard to
   match their brand"). The old abstract "Soft-SaaS / Terminal" naming and the §2 beat table's exact
   prompts are superseded by the built `demo/script.ts` (7 Studio prompts + 3 governance refusals:
   `contrast_floor`, `target_size_floor`, `seed_locked`).

Everything else in this spec (the lock-led-AA mechanism spike, the pure-var canvas, the scoped in-page
applier, chromium as the visual-truth gate, page-held session, the two-plane framing) held and shipped.

---

## 1. Goal & non-goals

**Goal.** A short, hosted, reliably-recordable demo that shows, on an app shaped like an enterprise
prospect's product: (1) **the magic loop** — a natural-language prompt instantly, smoothly re-themes
the app; and (2) **the governance proof** — the system *refuses* to break accessibility / brand locks,
and two tenants render different brands while both stay within one platform's invariants.

**The demo genuinely uses the engine's valuable half.** `parseSpec` (the wall) → `mergeDelta` →
`diffSpecs` → `compile` → `verify` all run **in the browser** (the engine is pure and plane-agnostic;
`culori` + `zod` are browser-safe). Only the non-essential production substrate is faked.

**Non-goals (explicitly out for the demo; they are Plan-08):** server-side session controller, real
HTTP API, audit trail, PII isolation, preview-token expiry, SSR end-user host route, content-addressed
publishing/`hashArtifact`, real persistence, auth, and the real LLM on camera.

**Reliability on camera is a first-class requirement.** Every choice favors a clean take over
production fidelity: no iframe, no SSR-per-turn, no network round-trip during the loop, no live LLM.

---

## 2. The recorded narrative (the demo *is* the script)

A ~60–90s flow for tenant **Acme**, then the **Globex** contrast, then the side-by-side climax. Exact
prompt wording and StyleSpec values are tuned during implementation; the beats are fixed:

1. **Open** on the analytics dashboard in its neutral base look (the platform's default).
2. **"Make it feel like Acme — deep indigo, a little more rounded."** → outcome **diff** (primary→indigo,
   radius↑); the dashboard re-themes **instantly and smoothly**. Acknowledge.
3. **"Warmer, softer surfaces."** → **diff** (neutral/accent shift); preview updates. Acknowledge.
4. **The contrast rejection beat (secondary governance proof):** **"Make the surfaces a bold, saturated
   [color]."** → outcome **rejected** (`contrast_floor` on **`muted-fg/muted`**, large-text 3:1, at the
   realistic **AA** tier). A saturated surface can't carry legible muted/secondary text, so `verify`
   refuses it. Panel: *"Muted/secondary text on that surface would fall below the legibility floor — so
   it's refused."* **The preview does not change — it stays accessible.** *"Watch it refuse to break
   accessibility."* (Part-1 finding: surfaces are profile-anchored and maximize-contrast body text
   always clears AA ≈4.58, so a body-text refusal is unreachable at AA — the `muted-fg` pair is the
   reachable AA contrast story. See `apps/tier-a-demo/MECHANISM-FINDINGS.md`.)
5. **The lock rejection beat (the HERO):** **"Recolor the error/destructive state to a friendly
   green."** → **rejected** (`seed_locked`) — the platform locked `destructive`, so the wall refuses it
   deterministically (it cannot miss on camera). *"The platform froze its error-state color; the tenant
   literally cannot recolor it."* This is the demo's **governance hero** — deterministic,
   mode-independent, and at the realistic AA tier (no AAA contrivance).
6. **Publish Acme** (promotes the acknowledged look to "live").
7. **Switch to Globex**, author a contrasting brand (e.g. emerald, sharper corners) — or load a
   pre-baked Globex theme to keep the take short. Publish.
8. **Climax — two-tenant side-by-side:** the *same* dashboard, Acme (indigo, rounded) beside Globex
   (emerald, sharp). Both clear the platform's **AA** contrast floor; both obey the same locks. **Toggle
   light↔dark on both** to show the theme is mode-polarized (dark ≠ inverted light) and accessibility
   holds in both modes.

> **Mechanism settled by the Part-1 spike (2026-06-23):** tier = **AA**; hero = the **lock** beat
> (`seed_locked`, deterministic); the contrast beat is the **secondary** AA `muted-fg` rejection.
> Surfaces are profile-anchored (no full-screen contrast beat) and a body-text AA rejection is
> unreachable, so the dramatic/AAA framings were dropped. Full data: `apps/tier-a-demo/MECHANISM-FINDINGS.md`.

The narrative, the staged rejection states, and the side-by-side are the deliverable. Polish lives
here, not in infrastructure.

---

## 3. Architecture

A single **client-side** app — `apps/tier-a-demo` (Vite + React + Tailwind v4 + shadcn-style
components; matches the `apps/console` / `apps/demo` stack; renameable, path is a find-replace). No
backend. Hosted as a static build; the user records it.

```
apps/tier-a-demo/
  src/
    canvas/        the analytics-dashboard app (shadcn components consuming hsl(var(--x)))
    customizer/    the prompt widget + OutcomePanel + session controls (page-held session)
    preview/       scoped in-page apply (compiled vars → wrapper element)
    demo/          the canned agent + the demo manifest + the scripted beats
    sideBySide/    the two-tenant climax view + light/dark toggle
```

### 3.1 The seams (deep modules — kept identical to the product so promotion is cheap)

| Module | Interface (small) | Implementation | Promotes to (Plan-08 / console / SDK) |
|---|---|---|---|
| **Engine half** | `parseSpec · mergeDelta · diffSpecs · compile · verify` (from `@invariance/theming`) | unchanged, runs in-browser | identical in the product |
| **Agent** | `Agent` (`gatekeep`, `design`) | a demo-local **CannedAgent** mapping each scripted prompt → a perfect `GateClassification` + StyleSpec JSON | swap CannedAgent → MockAgent → QwenAgent at the same seam |
| **Scoped apply** | `applyScoped(wrapper, candidate, mode)` | sets the compiled var map as inline CSS custom properties on the wrapper element | promotes to the production applier (`renderStyleText`/`styleTag`/`applyTheme` at `:root`/`.dark` + end-of-head) in Plan-08 |
| **Page session** | a small in-memory hook: `draft`, `runTurn(prompt)`, `acknowledge()`, `publish()`, `reset()` | wraps the engine half + CannedAgent; holds `draft`/`pendingSpec`/`published` per tenant in React state | promotes to the server-side session controller + stores |
| **Canvas** | a prop-less React dashboard rendering at the wrapper scope | shadcn components | reused by the SDK / reference-app |

Two seams are *real* (two adapters exist or will): Agent (canned→mock→qwen) and apply
(scoped-inline→production-applier). The rest are reused-as-is.

### 3.2 In-page scoped preview (the camera-safe choice)

The compiled `CandidateTheme.light` / `.dark` is a `Record<VarName, "H S% L%">` (bare HSL triples). The
preview sets these as **inline custom properties on a wrapper `<div>`** that contains the dashboard
(`wrapper.style.setProperty("--primary", "240 …% …%")`, etc.). The dashboard consumes
`hsl(var(--primary))`. Re-theming is a synchronous style mutation → **instant, flicker-free on every
prompt→result**, with **zero network and no iframe**. The studio chrome (outside the wrapper) is never
re-themed because the redefinition is scoped to the wrapper, not `:root`.

**Light/dark toggle must set BOTH** the applied var map (`.light` vs `.dark` set) **and**
`class="dark"` on the wrapper. **The canvas themes 100% through CSS variables — zero `dark:` Tailwind
utilities.** A `dark:`-gated style won't activate from a var-map swap alone, and `dark:` is idiomatic
in shadcn-style code, so it would creep in by habit and render half-dark on camera. Setting the class
too is belt-and-suspenders; pure-var theming is also more faithful to what the real product does.

> Deliberately *not* the production applier (`:root`/`.dark` + end-of-head + iframe). That mechanism
> proves the real cascade and is correct for Plan-08; for a live recording it is the single most
> likely thing to glitch (load flash, frame race, blank frame). Demo = scoped inline apply; product =
> the real applier.

---

## 4. The demo manifest & canned script (governance content)

The demo ships **one demo manifest** — a two-mode `AppManifest` (light + dark base) with:

- **Customizable brand seeds:** `primary`, `accent`, `neutral` are **unlocked** (so the tenant can
  rebrand — the whole point; note this differs from `SHADCN_CAN`, which locks `primary`).
- **One platform lock:** `destructive` is **locked** — drives the **hero** lock-rejection beat #5.
- **Contrast tier — AA (settled by the Part-1 spike).** AA is the realistic/legal standard, so the
  standard shadcn base already passes `refBasePassesTier` (no AAA base to build). The spike confirmed
  surfaces are profile-anchored and maximize-contrast body text always clears AA (≈4.58 ≥ 4.5), so the
  reachable AA contrast rejection is the **`muted-fg/muted`** large-text pair under a *saturated*
  `neutral` (beat #4, secondary). See `apps/tier-a-demo/MECHANISM-FINDINGS.md`.
- **Chroma cap** as in the can (keeps brand colors from going garish).

The **CannedAgent** maps each scripted prompt to a fixed `{ classification, specJson }`. The success
beats use seed values the spike confirmed clear AA in both modes (dark indigo, warm-light neutral); the
contrast-rejection beat uses a *saturated* neutral that trips `muted-fg`:

| Beat | Prompt (illustrative) | Canned output | Engine outcome |
|---|---|---|---|
| 2 | "deep indigo, rounded" | `in_scope_styling`, `{colors:{primary:"oklch(0.35 0.12 270)"}, radius:<↑>}` (dark indigo, primary-fg/primary ≈ 11.6:1) | diff |
| 3 | "warmer, lighter surfaces" | `in_scope_styling`, `{colors:{neutral:"oklch(0.95 0.03 60)", accent:<warm>}}` (light warm surfaces ≈ 20:1) | diff |
| 4 | "bold, saturated surfaces" | `in_scope_styling`, `{colors:{neutral:"oklch(0.45 0.18 ~30)"}}` — trips `muted-fg/muted` (large-text 3:1) at AA | **rejected** `contrast_floor` (verifier) |
| 5 | "destructive → green" | `in_scope_styling`, `{colors:{destructive:<green>}}` | **rejected** `seed_locked` (wall) |

The rejection beats are produced by the **real engine** (the wall rejects #5; `verify` rejects #4) —
the CannedAgent only supplies the proposal. The on-screen copy is rendered from the engine's
`failureTemplate` (deterministic, keyed on the failure code), then styled for the camera. (Exact
`accent`/`radius`/green values are tuned when the next plan encodes + asserts these beats.)

---

## 5. Components

- **Canvas — `AnalyticsDashboard`:** sidebar, KPI stat cards, one or two charts (CSS/SVG using theme
  vars), a data table, filter chips, primary/secondary CTAs, a destructive action, muted helper text —
  chosen so every contrast-relevant role is visibly exercised. Pure presentational; renders at the
  wrapper scope. **Themes exclusively through `hsl(var(--x))` — no `dark:` Tailwind utilities** (see
  §3.2), so the var-map swap fully controls the look in both modes.
- **Customizer — `PromptBox`** (with a few clickable scripted example prompts), **`OutcomePanel`**
  rendering the three outcomes: **diff** (field-level list with from→to color swatches), **no-change**
  ("heard you — nothing moved"), and a **first-class rejection** state (the floor/lock explanation,
  legible and a touch dramatic — not a generic red error). **`SessionControls`:** Acknowledge, Publish,
  Reset.
- **`SideBySide`:** two wrapper-scoped dashboards (Acme, Globex) + a shared light/dark toggle; the
  climax view.

---

## 6. Error / governance states

The three turn outcomes are the product surface, and rejection is the hero:
- **diff** → preview the candidate; Acknowledge commits it into the draft and unlocks Publish.
- **no-change** → a distinct, calm state.
- **rejected** → the draft is untouched (the preview stays on the last good look); the panel explains
  *why* from `failureTemplate`. Both `contrast_floor` (verifier) and `seed_locked` (wall) are staged.

There is no fail-open SSR path to cover (no server/SSR in the demo). The "never breaks" story is told
by the rejection beat, not by infrastructure.

---

## 7. Testing (light — reliability of the take, not re-verifying the engine)

The engine is already deeply verified (273 + 117 tests). The demo's tests guard the *recording*, split
by what each test medium can actually prove:

- **Logic tests — node / happy-dom:** the engine-half outcomes (does a scripted prompt produce
  `diff` / `no_change` / `rejected` with the right code), the page-session reducer (accumulate →
  acknowledge → publish → reset), the CannedAgent mapping. happy-dom is fine here.
- **Visual-truth tests — real chromium (Playwright) ONLY:** any "computed style reflects the theme"
  assertion. happy-dom / jsdom do **not** resolve `hsl(var(--x))` through the cascade — such a test
  would pass green while proving nothing. In chromium: beat #2 sets `--primary` and
  `getComputedStyle` of a CTA reflects the themed color; beat #4 leaves the wrapper's computed styles
  **unchanged** (preview stayed accessible); the light/dark toggle (class + var map) actually swaps
  the rendered colors.
- A **smoke test** that the full scripted sequence runs end-to-end without throwing (a take won't die
  mid-record).

No re-testing of `compile`/`verify`/contrast math.

---

## 8. Build order — validated parts, empirical gate first

Built and tested as five sequential parts, each green-and-reviewed before the next. The order
**front-loads the "is the demo even possible" gate** so no UI is built on an unproven hero beat:

1. **The spike — prove which beats fire, NO UI (the empirical gate). Its output is a DECISION, and it
   may revise this spec (§2 beats #4/#8, §4's tier).**
   > **✓ RESOLVED 2026-06-23** (`apps/tier-a-demo`, `MECHANISM-FINDINGS.md`): surfaces are
   > profile-anchored; a body-text AA rejection is unreachable; AAA would read as contrived → **AA tier,
   > lock-led hero, AA `muted-fg` contrast as the secondary beat**. The scaffold + probe + decision sub-steps
   > below were executed; the *encode* sub-step (1.iii) was split into the next plan (build against settled facts).

   In order:
   1. **Mechanism probe (the first thing written, before any tuning).** Run, through the *real*
      `parseSpec → compile → verify`: (a) a mid-L **`neutral`** — does it propagate to surface
      lightness, or are surfaces pinned to the ramp's anchorL (taking only hue/chroma)? (b) a mid-L
      **`primary`** and a mid-L **`accent`** (`{kind:"seed"}` → role L = seed L). For each, record
      *exactly which `contrastPair` fails and at which tier* (AA 4.5 vs AAA 7.0). Prior verification
      strongly suggests surfaces are **anchored** (so `neutral` can't drive a text pair below floor —
      it can at most fail the `ring` ui-pair), and that a mid-L seed-role fails a text pair **only at
      AAA** (maximize-contrast worst case ≈ 4.58 > 4.5). Confirm or refute on real output.
   2. **The decision (three-way, on data + buyer-judgment):** *contrast-via-surface-at-AAA* (only if
      surfaces propagate — the dramatic full-screen version), *contrast-via-`primary`/`accent`-at-AAA*
      (reliable, recolors buttons, but blanket-AAA reads as restrictive/contrived to a technical buyer),
      or *lock-led at the realistic AA* (the `seed_locked` wall rejection as hero — deterministic and
      credible — with contrast demoted or cut). Record the rationale.
   3. **Encode the chosen mechanism:** the **demo manifest** (the chosen tier; if AAA, an AAA-passing
      base in both modes confirmed via `AppManifest.parse` — *not* a one-line flip, see §4) + the
      **CannedAgent** specs, with a test asserting **each scripted prompt produces its intended
      outcome** (the hero rejection fires; the success beats clear the floor) on the real compiled
      output. Then update §2's beats and §4's tier to match what was proven.
   This part is rigorous; being wrong here is the only expensive mistake. It is the "is this demo even
   possible / what is the demo actually" gate — no UI until it settles.
2. **Canvas + `applyScoped`.** The `AnalyticsDashboard` rendering through `hsl(var(--x))` at wrapper
   scope (no `dark:` utilities); light/dark by var-map swap **+ `.dark` class**. Verified in **chromium**.
3. **Customizer + page-session.** `PromptBox`, `OutcomePanel` (rejection first-class), `SessionControls`,
   wired to Parts 1 + 2.
4. **Side-by-side + light/dark climax.** The two-tenant view and the mode toggle.
5. **Recording-reliability tests + rejection-state polish.** The smoke test of the full scripted
   sequence + the on-camera styling of the rejection states.

Each part becomes its own implementation plan (writing-plans), executed and tested before the next.

## 9. What's dropped vs Plan-08, and how it promotes

**Dropped for the demo:** server-side session controller + HTTP routes, audit trail, PII handling,
preview-token expiry, SSR end-user host route, `resolveThemeTag`-based delivery, content-addressed
publish, real persistence/auth, real LLM.

**Promotes cleanly because the seams are identical:** swap CannedAgent → QwenAgent at the Agent seam;
swap scoped-inline apply → the production applier; lift the page-session hook into the server-side
session controller + stores; the dashboard/canvas becomes (or is replaced by) the reference-app the SDK
mounts into. The engine half does not change.

---

## Appendix A — Plan-08: the real studio (captured so it isn't lost)

The product design from this brainstorm, to build once a prospect validates demand:

- **`apps/studio`** (Next.js), one process, two route groups linked only by the shared stores (the
  control-plane↔data-plane seam):
  - **Control plane — `/studio` + `/api/*`:** a **session controller** behind ~5 routes —
    `POST /api/tenants/:t/turns {prompt}` (gatekeep→design→wall→merge→diff→compile→verify; stash
    candidate under a preview token), `POST …/acknowledge`, `POST …/publish`
    (`publish` = artifact→pointer→audit), `POST …/reset {to}`, `GET …/session`, and
    `GET /preview?token` (SSR the gallery with the candidate's styleTag, no pointer write). Prompts,
    session, and audit stay server-side. **Iframe preview** so the artifact's real `:root`/`.dark`
    selectors + end-of-head placement behave exactly as in production.
  - **Data plane — `/`:** SSR `resolveThemeTag({tenant, mode, nonce, stores})` → inject `<style>` at
    end-of-`<head>` → render the gallery → client `bootstrapMode`. Fail-open on all six
    `FailOpenReason`s.
- **Deep modules / seams:** session controller (→ console), `resolveThemeTag`+`bootstrapMode` (→ SDK),
  reference gallery (→ host + preview + reference-app), agent-selector (qwen/mock), stores (in-memory →
  Postgres/R2/KV behind the 3 engine interfaces).
- **Sequencing of the rest:** **Governance Console** = more control-plane routes/views over the same
  session controller + stores + manifest (onboarding/coverage, var→role confirm/edit, invariant
  editor, tenant browser, kill-switch). **Drop-in SDK** = the packaged data-plane apply (provider/script
  mounting `resolveThemeTag`+`bootstrapMode`+widget) extracted from the `/` route. Order:
  **demo → console → SDK**.
