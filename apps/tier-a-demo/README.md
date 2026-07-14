# tier-a-demo — the Tier-A recorded sales demo

A **client-side** (Vite + React) demo that runs the verified `@invariance/theming` engine **in the
browser** to show *governed natural-language theming* for the **embedded-dashboard use case**:

> You sell an analytics dashboard that other companies embed in their product. Every client wants it
> to look native to *their* brand. A client types one sentence — and it does, **without ever breaking
> your rules** (accessibility, locked elements).

It is a recorded sales asset, **not** production substrate (no server, no SSR, no real LLM — a
`CannedAgent` supplies deterministic StyleSpecs so every take is identical). The full multi-tenant
studio is deferred ("Plan-08").

## Run it

```bash
pnpm -F @invariance/tier-a-demo dev      # Vite dev server → http://localhost:5173
```

Two tabs:
- **Studio** — the single-tenant customize loop (a client themes the dashboard + the governance refusals).
- **Side-by-side** — the climax: the same dashboard rendered native to **Stripe** vs **Bloomberg**, one shared light/dark toggle.

Other scripts: `build`, `preview` (serve the build), `test` (61 tests incl. 2 real Playwright/chromium), `typecheck`.

## The narrative (what the recording shows)

1. **Default dashboard** — a generic "Northstar" analytics product (system font, sharp, neutral).
2. **"Make it match Stripe."** — one prompt shifts the **entire design language** at once: color +
   corner radius + **density→spacing** + **typography (fonts)** + elevation + border + layout
   structure. ~11 axes in the diff panel. (Violet, Geist, rounded, roomy, soft shadows.)
3. **Acknowledge → Publish** — Publish is gated until Acknowledge (nothing ships by accident).
4. **Three governed refusals** (the differentiator; the live look never moves):
   - `contrast_floor` — "bold saturated orange" would fail the WCAG contrast floor (real numbers).
   - `target_size_floor` — "make it compact" drops interactive targets below **WCAG 2.2 §2.5.8 (24px)**.
   - `seed_locked` — the error color is locked by the app's invariants.
5. **Dark toggle** — the theme holds in both modes.
6. **Stripe vs Bloomberg side-by-side** — same dashboard, same manifest, two clients: Stripe (violet,
   Geist, rounded, sidebar, roomy) vs Bloomberg (amber + green, IBM Plex Mono, sharp, dense top-nav).
   The shared toggle drops both to dark → Bloomberg becomes the iconic amber-on-black terminal.

**Recording runbook** (keep open on a second screen): the storyboard artifact — an operator guide with
the exact clicks, the lines to say, and the "slow-down" cues for the three hero moments. Pre-flight:
warm the fonts (open both tabs once), drive from the chips, pace ~1s, Reset between takes.

## How it works (architecture)

- **Governed axes are engine-emitted** (`@invariance/theming`, manifest `SHADCN_CAN_V2` / `iv-roles-2`
  / `iv-profile-2`): the color roles, `--radius`, the density-driven spacing scale `--space-*`, and
  the resolved font stacks `--font-display/body/mono`. These carry a governance claim — the legibility
  floor governs spacing; the font allowlist governs typography.
- **Aesthetic axes are canvas-applied** (not routed through the verified engine): `shadow`,
  `borderWeight`, display weight/tracking, and font-size — mapped to CSS in `AnalyticsDashboard.tsx`
  (`SHADOWS`/`BORDERS`/`SIZES`). They remain enums on the StyleSpec (lockable + feed `structuralProfile`).
- **Structure** switches via `structuralProfile(spec) → "dense" | "standard" | "roomy"` (a prop on the
  canvas): dense = top-nav + inline KPIs + compact grid; roomy/standard = sidebar + elevated cards.
- **Fonts** are self-hosted OFL woff2 under `public/fonts/` (Geist, Geist Mono, IBM Plex Mono/Serif),
  `@font-face` in `src/index.css` with `font-display: block`.
- **Import discipline:** browser code imports only crypto-free subpaths of `@invariance/theming`
  (`/spec`, `/session`, `/compile`, `/manifest`, `/authoring`) — never the bare barrel (it pulls
  `node:crypto` and breaks the bundle).

## Layout

```
src/
  canvas/AnalyticsDashboard.tsx  # the themed "Northstar" dashboard (pure-var + profile-driven structure)
  demo/       manifest.ts (DEMO_MANIFEST on iv-roles-2), script.ts (canned Stripe/Bloomberg + beats),
              canned-agent.ts, run-turn.ts, wiring.ts
  studio/     StudioView, SideBySideView, TenantColumn, session-state (pure reducers), useDemoSession
  preview/    apply-scoped.ts (scoped :root-style var applier + .dark)
public/fonts/ # self-hosted OFL woff2 + OFL.txt
test/         # logic (node/happy-dom) + 2 chromium (Playwright) vibe-shift proofs
```

The engine changes this demo relies on are append-only (`iv-roles-2`/`iv-profile-2`; `iv-roles-1` /
`SHADCN_CAN` are byte-identical, so the 117-test verification oracle passes with no regeneration).
