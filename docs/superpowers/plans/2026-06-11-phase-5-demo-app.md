# Phase 5: Demo App ("Nebula") + Visual Gauntlet

> **For agentic workers:** Executed via superpowers:subagent-driven-development in-session. This doc records the design decisions; task prompts carry the implementation detail.

**Goal:** A Netflix/Spotify-class media-browsing demo app in `apps/demo`, hand-wired with the v6 two-tier token system, plus a deterministic visual gauntlet page that compiles the ten vibe packs and applies them — so the quality thesis is judged on rendered pixels.

**Why a fresh app (not the v5 dashboard):** product direction calls for a consumer media-browsing demo (also matches the cofounder demo flavor in DESIGN_kb, strengthening the integration-gate conversation). The v5 dashboard at `b2a9857^` remains in history; its Providers/panel integration pattern (56d19d8) is reused.

**App shape:** fixed left sidebar (logo, nav, library) — gives "make the sidebar blue" its target — plus a main pane with hero billboard, five horizontally-scrolling content rows of gradient-poster title cards, and a footer. Dark, professionally designed default styled *through* the role tokens per the design-taste skill (cool-tinted neutrals, one crimson accent, coherent material language).

**Two-tier tokens:** `globals.css` defines the full canonical role vocabulary on `:root` plus slot tokens that reference roles (`--inv-sidebar-bg: var(--inv-surface-1)` etc.). Tailwind maps semantic utilities to the vars. All components style via tokens — zero hardcoded colors outside `:root`.

**Invariance wiring:** `m.slot` wrappers (sidebar/header/hero/rows/footer) with `cssVariables`, `description`, `aliases`; `m.text` on hero + row headings (lights up in phase 6); F4 component library `{ CarouselRow, GridRow }`; relational constraints config (`contrast >= 4.5`, `accent_chroma_max 0.25`), pages `/` at level 4; `CustomizationPanel` mounted with `NEXT_PUBLIC_ANTHROPIC_API_KEY`.

**Known scope limits (not bugs):** F2 content and F3 layout overrides do not render for v2 themes until phase 6 (render-driven primitives); fonts for non-default pairings load only on the gauntlet page (the runtime font loader is phase 8 — the gauntlet injects Google Fonts `<link>`s from `FONT_PAIRINGS` itself).

**Gauntlet:** `/gauntlet` route — `?pack=<id>` compiles that pack's StyleSpec via `compileTheme` + `deriveConstraints`, builds a `ThemeJsonV2`, applies via `applyAnyTheme`, injects the pairing's font link; `?sidebar=blue` overlays the slot-edit-shaped pair (`#1b2a4a` bg + solved text, the contrast-verified pair from core's tests); bare `/gauntlet` lists all ten vibes. Ten vibes = pack ids: retro-arcade, neobrutalist, soft-pastel, terminal-green, glass-dark, editorial, ocean, sunset, mono, corporate-trust.

**Verification:** `pnpm build` green across workspace; dev server + Playwright screenshots of default + ten packs + sidebar-blue; screenshots judged against design-taste criteria (distinct, coherent, readable); fix-and-reshoot loop until pass.

**Exit criteria (CLAUDE.md phase 5):** ten-vibe gauntlet judged visually; "sidebar blue" works live.
