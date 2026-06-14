# Console + customization-menu restyle — design

- **Date:** 2026-06-13
- **Status:** Approved → implemented on `feat/console-widget-restyle`

## Goal

Make the developer **console** (`apps/console`) and the in-app **customization menu**
(`PromptWidget` in `@invariance/client`) look cleaner — more whitespace, clearer
hierarchy, less busy — in the calm spirit the user liked pre-combine. No specific old
design to match; "Approach A — cohesive calm refresh." Palette: refined dark (token-driven,
so a light variant is a small change later).

## Approach (A — cohesive calm refresh)

A shared visual language across both surfaces; no layout rewrite, no logic changes.

### Shared tokens (console `styles.css` `:root`)
Deeper neutral surfaces (`--bg #0a0c11`, `--panel #11141b`, `--panel-2 #161a22`), hairline
borders (`rgba(255,255,255,.07)`), disciplined text ramp (`--text/--muted/--faint`), one
calmer accent (`#8a7dff`) + `--accent-soft`, desaturated status colors, radius `--r/--r-sm`,
a subtle `--shadow`. Existing `var()` usages inherit the refresh.

### Developer console (`apps/console`)
- Help banner **collapsed by default** to a one-line "How Invariance works" link (was a large
  always-on numbered block — the biggest source of busy).
- Stat cards left-aligned on `--panel-2`; bar charts de-emphasized (6px, muted accent fill).
- Mods table: uppercase hairline headers, more row padding, hover highlight, soft-tinted
  status chips. Panels get the subtle shadow + more padding; more whitespace between sections.
- The Guardrails view inherits the same tokens automatically.

### Customization menu (`PromptWidget`, `@invariance/client`)
- Replaced inline white/black styles with a scoped, injected stylesheet under
  `[data-invariance-widget]`.
- **Theme-aware:** reads the host app's `--inv-*` role tokens (surface/text/accent/border/
  radius/shadow) with safe fallbacks, so it looks native on any theme (verified on the dark
  teal seed theme and a light sunset theme).
- Polished card: header (✨ Customize + close ×), padded textarea with an accent focus ring
  (`color-mix` of `--inv-accent`, so it always matches the accent), full-width accent "Apply"
  button with states, success/error-tinted messages, refined trigger pill + degrade banner.
  Cmd/Ctrl+Enter submits.

## Files touched
- `apps/console/src/styles.css` — tokens + component refinements.
- `apps/console/src/App.tsx` — `HelpBanner` collapsed by default.
- `packages/client/src/react/index.tsx` — widget restyle (theme-aware, scoped styles).

## Verification
Visual (before/after screenshots: console dashboard, widget on dark + light themes).
Typecheck green (client/console/demo); console builds; demo e2e 24/24 pass (widget change safe).
