# Scalable onboarding: archetype-keyed layout customization

**Date:** 2026-06-15
**Status:** Design approved; ready for implementation plan
**Topic:** Make app onboarding scale to multi-page apps by discovering page *archetypes*
and centralizing customization (tokens + layout) so a single change replicates across all
pages of a type.

---

## 1. Problem & motivation

Today the design plane behaves beautifully *for an app that was hand-wired to it*. Nebula's
components were manually edited to read `var(--inv-*)` tokens (Tailwind config + per-component
edits), its customizable regions were hand-wrapped in `<m.slot>`, and its pages/sections were
hand-listed in `invariance.manifest.json#designSurface`. The scanner
(`packages/cli/src/scan.ts`) is single-pass and flat — it scrapes colors/routes/components into
a list but **does not enumerate pages, build a per-page section map, or wire anything.**

That hand-wiring is exactly what does not scale to "an app with multiple pages and various
components." Two consequences we must fix:

1. **Onboarding must auto-wire a multi-page app**, not just produce a list. The expensive
   semantic work belongs at onboarding-time (once), so every later change stays cheap.
2. **Layout is the headline capability, not color/font.** Color/font/spacing consistency is
   already solved by the role-token layer ("change one token, the whole app recolors, across
   every page"). The novel, valuable part is **layout redesign** — and it must propagate by
   **page archetype, not by individual URL.** An e-commerce product page is *one template*
   rendered for thousands of URLs; redesigning it must replicate to all of them.

### The gap this exposes

The design plane currently keys F2–F4 (content/layout/component) customizations by concrete
**pathname**: slots register via `useCurrentPage()` (the live URL), and customizations live in
`themeJson.components.pages[pathname]`. That is fine for Nebula's static `/` and `/series`, but
for a dynamic route it would key by `/title/42` and **not** replicate to `/title/99`. The fix is
to key by **route archetype** (`/title/[id]`).

---

## 2. Decisions (the four forks, settled)

| Fork | Decision |
|---|---|
| **Onboarding invasiveness** | **Hybrid.** Generate a central token/settings layer + a mapping, and codemod the customer's source only where a runtime overlay can't reach (wrap sections in `m.slot`, repoint hardcoded palette classes). Preserves full F1–F4 capability while minimizing edits. |
| **Target scope** | **React + Tailwind** for now (Nebula-like). Note expansion to other styling families (CSS modules, styled-components, inline) and other frameworks as future work. |
| **Proof target** | **Un-wire Nebula → `apps/nebula-clean`** and onboard it back. Strongest proof (reproduce known-good wiring); realizes the `nebula-clean` fixture the project already intended. |
| **Layout expressiveness** | **Compositional grammar.** A bounded but rich per-archetype `LayoutSpec` the LLM composes; deterministically verified; keyed per archetype. Generalizes today's F2–F4 + `layout_profiles`. Not free-form generative (would break the "LLM never in the gate" guarantee). |

**Overall approach:** *heavy onboarding, cheap change-time.* Onboarding does the expensive
semantic work once — discovering structure and rewiring the app to reference central "names" —
so every later change is just editing a name's value.

---

## 3. The model — three centralization layers, keyed by archetype

Everything customizable is **named once at onboarding**; every change edits a *name's value*,
never the call sites. The one-time codemod's only job is making call sites *reference* the names.

| Layer | What's centralized | The "name" you edit | Fans out via |
|---|---|---|---|
| **Token** (look) | colors, fonts, spacing | ~27 role tokens (`--inv-accent`, `--inv-space-sm`, …) | CSS cascade — every page, instantly |
| **Archetype** (structure identity) | page templates + their named sections | `designSurface` (route patterns + sections + levels) | one template component → all its URLs |
| **Layout** (structure customization) | section order, region mode (grid/list/carousel/columns), component variant, density | per-archetype **`LayoutSpec`** | archetype key → every page of that type |

The **token** layer already exists (`packages/design-schema/src/role-tokens.ts`,
`packages/design/src/compiler/`). The **archetype** and **layout** layers are the new work.

### Archetype = route pattern + shared template

- A **dynamic** route (`app/title/[id]/page.tsx`) is one component rendered for many URLs ⇒
  **one archetype** (`/title/[id]`).
- A **static** route (`/`, `/series`) is its own archetype where `pattern === path`.
- The eBay requirement ("redesign one product page → all product pages") is *natural* once we
  wrap the template's sections once and key its `LayoutSpec` by the pattern.

---

## 4. Onboarding pipeline — what the scanner produces

The scanner grows from "flat list" into a structure-aware, fan-out pipeline that emits
**generated files committed into the app** (the "settings files").

### Stages

1. **Discover archetypes** — walk file-based routes (Next.js app-dir) → route patterns. Each
   dynamic segment (`[id]`) ⇒ one shared template ⇒ one archetype. *Deterministic, fast.*
2. **Per-archetype map (parallel fan-out)** — for each archetype: AST-parse the page/template
   component to find top-level **sections**; an LLM names/classifies each (semantic name,
   aliases, suggested level) and proposes its layout-grammar slots; cluster the file's
   colors/fonts/spacing into role tokens.
3. **Reconcile palette (barrier)** — merge color/font clusters across *all* archetypes into one
   consistent palette/token assignment. (Needs every archetype's colors at once.)
4. **Generate artifacts:**
   - `tailwind.config.*` rewrite → semantic utilities resolve to `var(--inv-*)`
   - `invariance.manifest.json` → archetype-aware `designSurface` (route patterns, sections,
     per-archetype `defaultLevel`) **+ per-archetype layout invariants** (§7)
   - `invariance.layout.ts` → each archetype's layout grammar (allowed section modes/variants)
   - `invariance-config.ts` + provider / `CustomizationPanel` wiring
5. **Codemod (per file, parallel, worktree-isolated):** repoint hardcoded palette classes →
   semantic (`bg-red-600` → `bg-accent`, `text-gray-100` → `text-textPrimary`); wrap each
   archetype's sections in `<m.slot>`; mount the provider.
6. **Verify:** typecheck/build + existing `verifyV2`
   (`packages/design/src/verify/compiled-tests.ts`) + the new **layout verifier** (§7) + a
   **visual-QA pass** confirming the render is unchanged (the codemod is *look-preserving*: it
   only relocates style references, it must not alter pixels on a default theme).
7. **Output a reviewable branch/diff** — because we edited the customer's source, the developer
   reviews before merge. (Extends today's `invariance init` which already emits an
   `INVARIANCE.md` wiring guide.)

### Why this scales

The per-archetype (stage 2) and per-file (stage 5) stages **fan out**. Wall-clock ≈ the slowest
single archetype/file, not the sum — a 40-page app onboards in roughly the time of its biggest
page. This maps directly onto a multi-agent workflow: discover → per-archetype map → reconcile
(barrier) → per-file codemod → verify.

---

## 5. `LayoutSpec` — the compositional layout grammar

A new per-archetype spec, built the same way `StyleSpec`
(`packages/design-schema/src/style-spec.ts`) is: structured **intent** (names + enums), **no raw
layout values**, composed by the LLM and compiled deterministically.

```
LayoutSpec {
  archetype: '/title/[id]',
  sections: [
    { name: 'hero',        order: 0, mode: 'stacked' | 'split' | 'banner' },
    { name: 'row-related', order: 1, mode: 'grid' | 'carousel' | 'list', columns?: 2..6 },
    { name: 'reviews',     order: 2, mode: 'list' | 'grid' },
  ],
  density?: 'compact' | 'standard' | 'comfortable'
}
```

A **layout compiler** maps a `LayoutSpec` → concrete per-section component/props selections,
*generalizing machinery that already exists*: the F4 component swap in
`packages/design/src/primitives/slot.tsx` and the `layout_profiles` presets in
`apps/nebula/src/lib/invariance-config.ts` (e.g. `gridHome()`, `CarouselRow → GridRow`) become
the **compiled output** of a `LayoutSpec` rather than hand-authored presets. The structural-vibe
mapping (`galleryProfile` in `packages/design/src/agent/layout-profile.ts`) is folded in as a
default/seed for the spec.

---

## 6. Archetype-keyed runtime (the part that makes the eBay case work)

- Add **`useCurrentArchetype()`** — maps a concrete pathname → its route pattern via the
  discovered archetype table (longest-match, dynamic-segment aware). `/title/42` → `/title/[id]`.
  (Sits beside `packages/design/src/context/use-current-page.ts`.)
- **`themeJson.components.pages` is keyed by archetype pattern**, not raw pathname. Slot
  registration (`buildSlotRegistration` in `slot.tsx`) and the level lookup in `gatekeeper.ts`
  key by archetype too.
- **Backward compatible:** static routes have `pattern === path`, so Nebula's existing `/` and
  `/series` keys are untouched; the schema change is additive.
- **Apply path is unchanged** — still look-plane, client-side, SSR cookie-mirrored
  (`packages/design/src/runtime/ssr.ts`, `apply.ts`), re-rendering via the existing
  `useSyncExternalStore` slot subscription (`context/provider.tsx`). A title-page redesign writes
  `pages['/title/[id]']` **once** and every title URL renders it. **No new distribution plumbing.**

---

## 7. The layout invariant gate (deterministic, no LLM)

Layout is the powerful part, so it gets the same **"LLM proposes, TypeScript enforces"** treatment
as themes. The manifest declares **per-archetype layout invariants** (alongside the existing
`policies` / design-constraints in `packages/schema/src/manifest.ts`), and a new deterministic
**layout verifier** enforces them inside the existing verify-retry loop.

Invariants:
- **Locked / required sections** — can't be hidden, removed, or (optionally) reordered (e.g. a
  buy-box, the header). Written last and override the spec — exactly like locked tokens in
  `compiler/compile.ts`.
- **Allowed region modes per section** — e.g. `row-related ∈ {grid, carousel}`, never `list`.
- **Min/max columns** and **ordering constraints** (e.g. `hero` must be `order 0`; buy-box stays
  above the fold).
- **Per-archetype level gate** — the existing 0–4 levels, now keyed by archetype `defaultLevel`
  in `designSurface`. A layout redesign is an F3/F4-class change, so it requires the archetype's
  level to permit it; the gatekeeper level-gate (`gatekeeper.ts`) already enforces this
  deterministically (the LLM only *classifies*).

The loop mirrors `verifyV2`: LLM proposes a `LayoutSpec` → verifier checks it against the
archetype's invariants → on failure, the reasons become `retryFeedback` and the Designer/Layout
step retries (≤N) → **no path applies an unverified `LayoutSpec`.** When a developer *tightens* a
layout invariant later, the live `LayoutSpec` is re-verified and recompiled-or-dropped, reusing
the theme-reconciliation behaviour already in `context/provider.tsx` + `reconcile-theme.ts`.

---

## 8. Proof — `apps/nebula-clean` + the demo

### Fixture

Create `apps/nebula-clean`: Nebula's `/` and `/series` with the `m.*` wrapping stripped and
`var(--inv-*)` classes replaced by hardcoded Tailwind palette classes — **plus a new
`/title/[id]` archetype** (a title/detail page rendered for many IDs; the e-commerce
product-page analog). Three archetypes total: `/` (static), `/series` (static), `/title/[id]`
(dynamic template).

### Proof

Run onboarding on `nebula-clean` → it should reproduce wired-Nebula-equivalent `/` and `/series`
**and** produce a working `/title/[id]` archetype with its sections wrapped once. Green gate =
build passes + visual-QA render matches the pre-onboarding render (look-preserving codemod) +
`verifyV2` + the new layout verifier pass.

### Demo money-shots

1. **"make it retro"** → grids + sharp **consistently across all three archetypes** (token +
   structural-profile consistency).
2. **"redesign the title page: stacked hero, related titles as a 2-column grid"** issued while
   viewing `/title/42` → **replicates to `/title/99` and every other title** (archetype keying —
   the headline).
3. Developer **locks the title page's `hero` section** in the Console → a later *"move the hero
   to the bottom"* is **rejected by the gate, live** (layout invariant enforcement).

---

## 9. Backward compatibility & migration

- `themeJson.components.pages` keying by archetype is additive: static routes are their own
  archetype (`pattern === path`), so existing Nebula themes keep working unchanged.
- `designSurface` gains route patterns, per-archetype `defaultLevel`, and layout invariants;
  existing manifests without them default to today's behaviour.
- Two enforcement engines remain by design (design compiler/verifier for look+layout; verifier +
  sandbox for data). The layout verifier lives with the look plane.

---

## 10. Out of scope (future work)

- **Non-Tailwind styling** (CSS modules, styled-components, inline styles, plain CSS) — the
  scanner would need per-styling-family normalization into the token layer.
- **Non-React frameworks** (Vue/Svelte/server-rendered) — would require per-framework slot
  primitives and overlay runtimes; well beyond the current React-only design plane.
- **Non-file-based routing** (custom React Router config) — archetype discovery would parse a
  route config instead of the app-dir tree.

---

## 11. Risks & open questions

- **Look-preserving codemod fidelity.** Repointing `bg-red-600 → bg-accent` only preserves pixels
  if the default token compiles to the same value. The reconcile step (stage 3) must seed the
  default theme from the app's *observed* palette so the first render is byte-identical; the
  visual-QA gate is the backstop.
- **Section discovery quality.** AST boundaries + LLM naming may mis-segment unusual layouts. The
  developer review-diff (stage 7) is the human gate; mis-named sections are editable in the
  generated manifest before merge.
- **Layout grammar breadth.** The first `LayoutSpec` vocabulary (mode/columns/order/density) is
  deliberately small. It must be expressive enough for the three demo shots without sprawling;
  expansion is iterative and each new axis needs a verifier rule.
- **Archetype collisions.** Nested/overlapping dynamic routes (`/[a]/[b]`) need a deterministic
  longest-match rule in `useCurrentArchetype()`; ambiguous cases should fail closed to per-path
  keying.

---

## 12. Success criteria

1. `pnpm` onboarding command runs on `apps/nebula-clean` and emits a reviewable diff that, when
   applied, builds and renders pixel-unchanged on the default theme (visual-QA green).
2. After onboarding, `verifyV2` + the new layout verifier pass on the generated manifest.
3. A `LayoutSpec` change on `/title/[id]` issued from one title URL is visible on **all** title
   URLs (archetype keying).
4. A token change (color/font) remains consistent across all three archetypes.
5. A developer-locked section causes a conflicting layout prompt to be rejected by the gate, live.
6. The onboarding pipeline's per-archetype and per-file stages run in parallel (fan-out), so
   wall-clock scales with the slowest unit, not the sum.
