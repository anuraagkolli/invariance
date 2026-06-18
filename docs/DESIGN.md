# Invariance — End-to-End Design

> **Status: canonical.** The one doc to read to understand the whole system. It is an
> *overview* — it summarizes and links into the depth, it does not restate it.
>
> **Depth lives in three places:**
> - Locked pipeline contracts + laws → [`superpowers/specs/2026-06-17-governed-theming-pipeline-design.md`](superpowers/specs/2026-06-17-governed-theming-pipeline-design.md)
> - Every cross-module type/signature + package map → [`superpowers/plans/2026-06-18-theming-00-interface-ledger.md`](superpowers/plans/2026-06-18-theming-00-interface-ledger.md)
> - 69 TDD tasks across 7 plans → [`superpowers/plans/2026-06-18-theming-00-suite-index.md`](superpowers/plans/2026-06-18-theming-00-suite-index.md)
>
> Ubiquitous language (use these terms exactly): [`../CONTEXT.md`](../CONTEXT.md).

---

## 1. What we're building

Invariance lets a **multi-tenant platform** — a B2B SaaS company, a marketplace, a creator
platform: any app with **sub-brands under one roof** — offer *governed, natural-language
customization* of its product. The platform declares the **invariants** (brand, accessibility);
its **tenants** reshape the look within them, by prompt.

**We sell the guardrails, not the prompt:** *"say yes to per-tenant customization without the
risk."* The platform stops building N bespoke settings UIs, kills professional-services theming
cost, and if anything ever fails the app falls open to its own base design.

**ICP qualifier:** the platform has sub-brands that want to look different *and* a brand/trust
owner who must keep them in bounds — and the app themes through **CSS variables / design tokens**
(Tailwind v4, shadcn/ui, MUI/Chakra theme providers). No variables to redefine → not a fit.

**v1 wedge:** the **B2B SaaS platform** (sub-brand = customer org) is the beachhead; the mechanism
generalizes unchanged to marketplaces (sub-brand = seller) and creator platforms (sub-brand =
creator). The engine is identical across all three — only the funded buyer differs.

**Scope: Tier A (governed theming) only.** This is the MVP and the entire subject of this design.

| Tier | What a tenant changes | Status |
|---|---|---|
| **A — Governed theming** | colors, typography, density, radius, light/dark | **this doc** |
| B — Governed layout / slots | rearrange/swap declared regions | deferred |
| C — Governed logic | API request/response at the seam (signed, sandboxed) | deferred (the as-built business-logic plane) |

---

## 2. The two rules everything rests on

**Rule 1 — No production request transits Invariance.** This forces two planes:

- **Control plane** (our infra): all the *thinking* — scan, the LLM pipeline, verification,
  publishing. Allowed to be slow.
- **Data plane** (the platform's infra): what end users hit every page load — fast, and unable to
  take the platform's app down. **Fails open to base design everywhere.**

**Rule 2 — The LLM is in the loop, never in the gate. The StyleSpec is the wall between them.**
Both non-deterministic stages (Gatekeeper, Designer) sit *before* the StyleSpec. Everything to the
right of the wall is deterministic code that never sees raw model text again. A hallucinated or
adversarial proposal can only ever be **rejected**, never published.

> **The payoff (drives everything):** the entire valuable half — merge → compile → verify →
> publish — is testable with **zero LLM** by hand-writing StyleSpecs. The model's blast radius is
> bounded by construction.

---

## 3. Actors & the core mechanism

**Three actors, never overlapping** — and the multi-tenant hierarchy:

```
Invariance ── app/Platform (owns the manifest, declared once)
                 └── Tenant (owns a theme, prompts via its brand admin)   ← subject = tenant
                        └── End users (just load the page)
```

- **Platform engineer** sets it up once (onboarding). **Tenant admin** customizes by prompt,
  within invariants. **End user** only loads the page.
- The manifest is **per-app**; the live theme pointer is **per-tenant** (`subject = tenant`).

**The mechanism, in one sentence:**

> We don't theme by editing anything; we **redefine the CSS variables the app already uses.**

```
Platform component (untouched):   class="bg-[var(--primary)]"
App's own :root:                  --primary: #4f46e5;
Invariance injects (per tenant):  --primary: #1e3a8a;   ← redefinition wins via the cascade
Result:                           the button is navy — zero source edits
```

**Fail-open by construction:** if Invariance does nothing (control plane down, fetch fails, theme
rejected) → *no variables are redefined* → the app renders its own defaults. There is no broken
state to fall into. Themes are declarative CSS values — no code executes, so **no signing is
needed** (signing is reserved for the deferred Tier C).

---

## 4. System architecture

```
        DATA PLANE (Platform infra)                CONTROL PLANE (Invariance infra)
        ───────────────────────────                ────────────────────────────────
   ┌──────────────────────────┐                ┌───────────────────────────────────────┐
   │ Platform's app + SDK      │ ── scan ─────▶ │ SCANNER  (onboard, once)              │
   │  • resolve tenant         │ ◀─ manifest ── │   ScanPayload → coverage → manifest   │
   │  • prompt widget          │ ── prompt ───▶ ├───────────────────────────────────────┤
   │  • inject mapped vars     │                │ AUTHORING  (the customize pipeline)   │
   │  • read pointer→artifact  │                │   Gatekeeper→Designer ═wall═ merge →  │
   │    from CDN (no transit)  │                │   compile → VERIFY → publish theme    │
   └──────────────────────────┘                ├───────────────────────────────────────┤
         │  serves base +                       │ GOVERNANCE / REGISTRY                 │
         ▼  governed theme       ┌────────────┐ │   manifest · per-tenant theme store   │
   ┌──────────────┐              │ Platform   │ │   + rollback + audit · artifact blob  │
   │  End users   │              │ eng / CS   │◀▶  · pointer + kill-switch              │
   └──────────────┘              │ (governs)  │ ├───────────────────────────────────────┤
                                 └────────────┘ │ CONSOLE  (governance dashboard)       │
   apply: SDK reads pointer→artifact from CDN   │   connect+coverage · map confirm ·    │
   — no production request transits Invariance  │   invariant editor · tenant browser   │
                                                └───────────────────────────────────────┘
```

Distribution is two-step and CDN-friendly: a tiny short-TTL **pointer** (`tenant → hash`) names an
immutable **content-addressed artifact**. Control-plane downtime degrades to the last-cached (or
base) theme — never an outage for the platform's app.

---

## 5. The three flows

### 5a. Onboard (Platform engineer, once)

The SDK runs on the live app and emits a **ScanPayload** (every `--*` variable, its declarations
per mode, how each is *consumed*, and any unreadable cross-origin sheets). The control-plane
**Scanner** classifies each variable into a **role** (OKLCH classification), infers its **format
contract** (how to re-serialize it — the bug-prone part), and produces a **coverage report** +, on
confirmation, the per-app **AppManifest**.

```
add SDK snippet ─▶ scan live --* vars ─▶ classify → roles + infer emit format
               ─▶ coverage report ("82% of color surface drivable") ── confirms ICP fit
               ─▶ confirm var→role map + set invariants (locks, contrast tier, modes)
               ─▶ publish AppManifest (per-app, governs all tenants)
```

For a **shadcn app the manifest is known in advance** — a prebuilt `SHADCN_CAN` skips scan-and-
confirm. This is the near-zero-touch path and **the v1 demo path**, so the demo never rides on
general CSSOM inference being perfect.

### 5b. Customize (Tenant admin, per change) — **the pipeline**

```
          LLM — in the loop                  ║          deterministic — the gate
                                             ║
 prompt ─▶ Gatekeeper ─▶ Designer ─▶ raw JSON ║ parseSpec ─▶ merge ─▶ compile ─▶ VERIFY ─▶ publish
           classify     sparse       ════════╫═  THE WALL    fold     role        re-checks   only on
           (cheap LLM)  StyleSpec    parse-don't  (closed   onto      VALUES +    final out,  explicit
                        (quality)    -validate    schema)   draft     contrast    trusts      publish
                                                                      repair      nothing
```

- **Gatekeeper** (cheap LLM, *not* the gate): one classification —
  `in_scope_styling | out_of_scope | targets_locked_invariant | abuse_or_injection`. Tuned for UX,
  not paranoia (the verifier still holds).
- **Designer** (quality LLM): the one creative call. Emits a **sparse StyleSpec** (only fields it
  means to touch) as raw JSON. Fed the invariants as a **constraint envelope** so it proposes
  in-bounds — a UX/cost optimization only, never enforcement.
- **The wall** (`parseSpec`): parse-don't-validate against a **closed** schema. Colors parse to
  OKLCH and clamp to the chroma cap; fonts are an allowlist index, never free text; a locked seed
  is rejected here. A dangerous string never advances.
- **Merge → compile → verify** run **every turn** to produce a live preview. **Publish** flips the
  pointer **only on the explicit action.** Compile + verify are pure (golden-file-able).

Three outcomes per turn: **diff** (preview the candidate; acknowledging commits it to the draft and
unlocks publish) · **no-change** ("heard you, nothing moved") · **rejected** (draft untouched —
never a half-applied state). A session accumulates acknowledged deltas into one draft; one publish
ships it.

### 5c. Apply (End user, every page load) — data plane, fail-open

```
request cookie (resolved mode) ─▶ read tenant pointer ─▶ fetch artifact by hash
   ─▶ pick the mode's var set ─▶ inline <style> in <head> (SSR) or blocking-script inject
   ─▶ ANY failure (pointer miss · disabled · missing/mismatched artifact · unsafe value · no CSP nonce)
      → inject nothing → base design renders
```

Dark vars emit **under the app's own dark selector** (specificity parity) and the `<style>` is
appended at the **end of `<head>`** so source order wins. `"system"` is resolved to a concrete mode
*before* SSR, so the server render is deterministic and flash-free.

---

## 6. The pipeline spine (the contracts at a glance)

Five **wall-grade contracts** are the boundaries everything deterministic compiles against; the
compiler and verifier are their pure *consumers*. (Signatures: the interface ledger. Laws: the
spec.)

| Contract | What it is | Home |
|---|---|---|
| **Role graph** (`iv-roles-1`) | seeds (input axes) → 27 output roles, their derivations, and the contrast pairs to check. Version-stable. | `@invariance/theming/roles` |
| **StyleSpec + merge/diff/session** | the wall schema (sparse, closed, parsed) + the pure delta-merge, three-state diff, and session state machine | `…/spec`, `…/session` |
| **ScanPayload** | the onboarding boundary: every `--*` var (per-mode declarations, how it's consumed, opaque sheets) the in-browser scan emits and the Scanner folds into a manifest | `…/scan` schema · `scan-sdk` (client) + Scanner (control-plane) |
| **AppManifest** | per-app contract: var↔role map + emit format, modes, `base`, `defaultSeeds`, invariants. `superRefine` is its first verification layer (incl. *base-passes-tier*, a hard publish gate) | `…/manifest` |
| **Artifact + applier + pointer** | immutable content-addressed `ThemeArtifact`; one pure `renderStyleText` + two sinks (`styleTag` server / `applyTheme` client); `Pointer` (`tenant → hash`) | `…/artifact` |

The **compiler** (`compile(draft, manifest) → CandidateTheme`; `…/compile` + the ramp `…/profile`)
and **verifier** (`verify(theme, manifest) → Verdict`; `…/verify`) are the pure *consumers* of these
boundaries — deterministic code that compiles against the contracts and never sees raw model text.
The compiler treats `base` as the canvas (a seed repaints only its derivation closure, transitively,
then contrast-repairs and serializes per the format contract); the verifier is **the gate** — it
re-parses every emitted string and trusts nothing, not even the compiler.

**The three-way cut** — the factoring that keeps the graph stable while policy moves per-app:

- **Role graph** carries *relationships and kinds* (version-stable → correctness).
- **Ramp profile** carries *numbers* (L-ladders, step magnitudes, nudges → eyes-on, golden-filed).
- **Manifest** carries *policy* (contrast tier, chroma cap, locks, modes → per-app).

Required contrast = `requiredContrast(manifest.tier, pair.category)` — every remaining degree of
freedom on the contrast path is a *number* (tunable), not a *relationship* (fixed), and the gate
catches any number that violates a relationship.

**Two graph subtleties that prevent real bugs:** color derivations are **mode-polarized** (dark ≠
inverted light — each mode has its own anchor-L and step ladder); and a **lock** projects two ways
— a *seed* lock is wall-rejected (freezes its whole derivation closure), a *derived-role* lock is
pinned to base by the compiler post-expansion.

---

## 7. Governance & invariant model

What the platform declares once (per-app, in the manifest), and the guarantee each gives:

| Invariant | Guarantee to the platform | Enforced by |
|---|---|---|
| **var → role map** | "customization drives exactly these variables" | applier indirection |
| **Locks** (seed or role) | "our brand/surfaces never change" | wall rejects re-seed · compiler pins to base · verifier re-checks byte-identical |
| **Contrast tier** (AA/AAA) | "every tenant theme is WCAG-accessible" | compiler may only *raise*; verifier re-checks the emitted triple |
| **Allowed modes** | "light only / dark only / both" | compiler + verifier reject disallowed modes |
| **Chroma cap** | "no garish, illegible themes" | clamped at the wall; verifier rejects over-cap |

Enforcement is **deterministic, every time**. The audit trail (prompt, StyleSpec, verifier report,
actor, stamped versions) is the governance product — and a **functional read path**: reset and
drift-recompile read the stored StyleSpec.

---

## 8. Where the code lives & build order

The pure deterministic core is a **new, plane-agnostic package `@invariance/theming`**, imported by
both planes (build the applier once, share it). Control-plane stages live in `apps/control-plane`;
the in-browser scan SDK + applier re-export live in `packages/client`; the SSR adapter is wired at
the host.

```
packages/theming/src/{roles,manifest,spec,session,profile,compile,verify,artifact,scan}  # plane-agnostic core (scan = shared ScanPayload schema)
apps/control-plane/src/theming/{scan, publish, authoring}                                # control-plane stages (Scanner, publisher, session/LLM)
packages/client/src/theming/{scan-sdk, applier re-export}                                # data-plane SDK (in-browser scan + applier)
apps/<host>/                                                                             # Next.js SSR delivery adapter
```

**Build order — `01 → 02 → 03 → 04 → 05 → 07`, with `06` runnable any time after `01`:**

```
01 determinism core (roles, manifest, StyleSpec wall, merge, diff)  ── creates @invariance/theming
 ├─ 02 compiler (ramp profile + compile, golden-filed)
 │   └─ 03 verifier (re-parse, trust nothing + adversarial suite)
 │       └─ 04 artifact + applier + pointer (cascade-win, nonce, cold-start)
 │           └─ 05 publish + storage + session (+ MockAgent zero-LLM e2e)
 │               └─ 07 LLM stages (qwen) + Next.js SSR delivery
 └─ 06 scan + Scanner (ScanPayload → manifest, the "can" path)  ── needs 01 only
```

**Milestones:** after **03** the entire valuable half is provable with zero LLM · after **05** a
full authoring session runs end-to-end via MockAgent · after **07** real prompts produce verified
themes and end users get SSR-themed, fail-open pages.

**Build scope — the 7 plans are the *engine*, not the whole product.** They deliver the
verifiable core (pipeline wall→compile→verify→publish, scan→manifest, applier, SSR delivery
adapter) — MockAgent-proven after 05, real-LLM + SSR after 07. The human-facing surfaces in
§4–§5 are **additional plans, not yet written** (build them *after* 01–07; they consume an
already-proven-safe core):

- **Governance Console UI** — connect + coverage report, var→role map confirm/edit, invariant
  editor, per-tenant theme browser, kill-switch.
- **Prompt widget** — the in-app UI the tenant admin types into; mounts the customize loop.
- **Drop-in SDK package** — the `<script>`/React provider (tenant resolution, theme fetch,
  applier + widget mount) — the §4 "app + SDK" box, packaged.
- **Preview surface** — the same-origin shadcn reference gallery the session renders candidates
  into (the renderer is built in 04; the gallery host is not).
- **Reference app** — a Tailwind-v4/shadcn sample wired with the SDK as the living e2e (Plan 07
  builds the *adapter*; it assumes a host app exists).

> **Greenfield, by design.** `@invariance/theming` is built clean against these contracts, *not* by
> reusing the existing `packages/design`. Reuse-first would let the old code's assumptions
> (subject=user not tenant, always-emit-hex, `--inv-*` role space) leak into the new design through
> the back door. Mapping proven algorithms (OKLCH math, contrast solving) onto the new package is a
> later, opportunistic step — the contracts come first. The old design plane + Nebula stay runnable
> until the Tier-A reference app supersedes them. An earlier *reuse-based* Tier-A attempt is also
> parked in the legacy stack (`cli/discover`, `apply-mapped.ts`, the `design-config-constraints`
> bridge, `DesignConfig.variableRoleMap`) — superseded by this engine, not reused, and retired later
> with the rest of the legacy stack rather than piecemeal. (CLAUDE.md "Build boundary" has the map.)

---

## 9. Trust & failure model

- **Fail-open everywhere.** Any failure (fetch, parse, verify, control-plane down, missing CSP
  nonce) → no variables redefined → base app. The platform's product cannot be broken by us.
- **No code execution in Tier A.** Themes are declarative values; there is no sandbox to escape.
- **Client re-verification / drift.** When the platform tightens an invariant, tenant themes
  re-verify on next load and recompile-from-StyleSpec or drop to base — no mass rebuild, no broken
  tenants.
- **Tenant isolation.** A tenant only fetches its own pointer; the artifact carries no tenant id
  (the tenant→hash binding is the pointer's job), so two tenants on the same hash can't observe each
  other.
- **PII.** Prompts live control-plane-side only, never in a distributed artifact.

---

## 10. Deferred / out of scope (named, not forgotten)

`chart-*` / `sidebar-*` roles (categorical, hue-rotation) → a later `vocabVersion` · `color-mix`
consumption → Platform confirmation for now · cross-origin preview of the platform's *real* app →
postMessage protocol (preview themes a same-origin reference gallery) · `density` output roles →
MUI/Chakra adapters · sub-AA base themes · **Tier B** (layout/slots) and **Tier C** (the
business-logic plane).

---

## 11. Map of the docs

| To understand… | Read |
|---|---|
| the whole system (this) | `docs/DESIGN.md` |
| every law, contract rationale, edge case | `docs/superpowers/specs/2026-06-17-governed-theming-pipeline-design.md` |
| exact type/function names + package homes | `docs/superpowers/plans/2026-06-18-theming-00-interface-ledger.md` |
| the 7 plans / 69 tasks + dependency DAG | `docs/superpowers/plans/2026-06-18-theming-00-suite-index.md` |
| the ubiquitous language | `CONTEXT.md` |
| how to run the demo / deploy | `docs/DEMO-RUNBOOK.md`, `docs/DEPLOY.md` |
