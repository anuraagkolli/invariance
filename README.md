# Invariance

**Make your existing React/Next.js app customizable by end-users — with a single CLI command.**

One `invariance init`, and your app gets:

- A natural-language customization panel where end-users can say *"make the sidebar dark blue"* or *"rename this button to 'Get started'"* and watch it happen.
- Hard guardrails you define (color palette, font allowlist, required sections, locked areas) that every change is verified against before it lands.
- Per-user persistence so each user sees their own version of the app.

No hand-written theming system. No custom admin UI. No rip-and-replace migration. The scanner wraps your existing JSX, rewrites hardcoded colors to CSS variables, and generates a locked config you unlock one section at a time.

> **Status: MVP (v0.1).** F1 style + F2 content + F3 layout + F4 component-swap are implemented and tested (143 unit tests). F5+ source changes, invariant-change UI, and hosted multi-tenant storage are deferred.

---

## 60-second demo

```bash
# 1. Install the CLI + runtime into your existing Next.js app
cd my-next-app
npm install invariance

# 2. Set your Anthropic key (the CLI uses it for semantic slot naming)
export ANTHROPIC_API_KEY=sk-ant-...

# 3. One command — scans source, writes config, wires up the provider, patches layout.tsx
npx invariance init .

# 4. Add the runtime key for the customization panel to your app's env
echo 'NEXT_PUBLIC_ANTHROPIC_DEV_API_KEY=sk-ant-...' >> .env.local

# 5. Run
npm run dev
```

Open http://localhost:3000, click the Invariance trigger button in the corner, and type:

> *make the sidebar dark blue*

The sidebar repaints. Refresh the page — it's still dark blue. Open in an incognito window — it's back to the original. Each user gets their own theme, stored in `localStorage` by default.

---

## Install

```bash
# npm
npm install invariance

# pnpm
pnpm add invariance

# yarn
yarn add invariance
```

`invariance` is a single package that contains both the React runtime and the `invariance` CLI. The CLI's heavy deps (`ts-morph`) are only imported by the CLI entry — they do not land in your app bundle.

Requirements:

- Node `>=20`
- Next.js `>=14` (app router, with `src/app/` or `app/`)
- React `>=18`
- Tailwind `>=3` (optional — the scanner reads your Tailwind config if present)

---

## Quickstart

### 1. Migrate your app

```bash
npx invariance init ./my-next-app
```

This runs the full migration in one shot. Files created/modified in your app:

| File | What it is |
|------|------------|
| `invariance.config.yaml` | Your invariants. All pages start at **level 0** (nothing customizable). You unlock sections incrementally. |
| `invariance.theme.initial.json` | Scanner-observed defaults — every `--inv-*` CSS variable and its original value. |
| `src/app/providers.tsx` | Generated React component that mounts `<InvarianceProvider>` + `<CustomizationPanel>`. |
| `src/app/layout.tsx` | Patched to wrap `{children}` in `<Providers>`. |
| `.env.example` | Reminder of the env var needed for the runtime panel. |
| `.invariance-migration-report.md` | Summary of what the scanner did — slots found, warnings, manual steps. |
| Your page/component source | `m.page` / `m.slot` / `m.text` wrappers inserted; hardcoded colors like `bg-[#1a1a2e]` rewritten to `bg-[var(--inv-sidebar-bg)]`. |

If the scanner can't auto-patch your `layout.tsx` (non-standard shape), it will print copy-paste instructions and continue.

### 2. Configure the runtime API key

The runtime Gatekeeper + Builder agents run **client-side** and call the Anthropic API directly. Add to `.env.local`:

```bash
NEXT_PUBLIC_ANTHROPIC_DEV_API_KEY=sk-ant-...
```

> **Security note.** `NEXT_PUBLIC_*` vars are bundled into your JS and visible to any user. This is fine for local dev and trusted-internal tools. For public production, proxy the agent calls through your own API route and use server-side keys — see [Storage & API proxy](#storage--api-proxy) below.

### 3. Unlock what users can customize

Fresh migrations leave everything locked. Unlock sections one at a time:

```bash
# See what's locked
npx invariance unlock --status

# Allow any color (palette constraint removed)
npx invariance unlock colors

# Allow any font
npx invariance unlock fonts

# Enable content editing (F2) across all pages
npx invariance unlock content

# Unlock layout (F3): let users reorder / hide sections
npx invariance unlock layout

# Unlock one page to a specific level
npx invariance unlock page /dashboard --level 3

# Unlock everything to level 4
npx invariance unlock all
```

Each command is a pure edit to `invariance.config.yaml`. Use `--dry-run` to preview.

### 4. Run

```bash
npm run dev
```

Open the app, click the Invariance panel trigger, type what you want changed in plain English.

---

## Customization levels

Invariance frames the design as a ladder. You choose how far up each page goes.

| Level | What changes | Stored in |
|-------|--------------|-----------|
| **F0** | Nothing — page is locked. | — |
| **F1** | Style: colors, fonts, spacing — within your palette + allowlist. | `theme.globals` (CSS variables) |
| **F2** | Content: text, labels, images. | `content.pages.<route>` |
| **F3** | Layout: reorder sections, hide optional ones. | `layout.pages.<route>` |
| **F4** | Component swaps: replace a section's component with one from your registered library. | `components.pages.<route>` |
| **F5+** | Source code, business logic. **Deferred.** | — |

A page at level 3 can do everything levels 1–3 allow but cannot swap components. The Gatekeeper agent enforces this on every request; if a user asks for a change above the page's level, it returns a clarification rather than producing an edit.

---

## CLI reference

### `invariance init [path]`

Migrate an app and wire up the React provider. Equivalent to `invariance scan <path> --apply` plus:

- Refuses to run if `invariance.config.yaml` already exists (use `scan` for re-analysis).
- Writes `.env.example` if missing.

Flags:

- `--api-key <key>` — Anthropic API key for semantic slot naming. Falls back to `$ANTHROPIC_API_KEY` or `$NEXT_PUBLIC_ANTHROPIC_DEV_API_KEY`. Without a key, slots get generic names (`section-1`, `text-1`).

### `invariance scan <path> [--apply]`

Analyze an app and report what migration would change. Default is **dry-run**: prints a unified diff to stdout and writes `.invariance-migration-report.md`.

Flags:

- `--apply` — actually write the modified source files, config, theme, and patch layout.
- `--api-key <key>` — same as `init`.

### `invariance unlock <section> [options]`

Adjust invariants post-migration.

Sections: `colors`, `fonts`, `spacing`, `content`, `layout`, `components`, `page <route>`, `all`.

Flags:

- `--status` — print the current lock state of all sections.
- `--level <n>` — required for `page <route>`.
- `--dry-run` — preview the YAML change without writing.
- `--config <path>` — app directory (defaults to cwd).

### `invariance help [command]` / `--help` / `--version`

---

## How customization actually works

```
User: "make the sidebar dark blue"
      |
      v
Gatekeeper (LLM) ---- classifies intent, validates page level
      |               outputs: { slotName, level, description, requirements }
      |               or: clarification / error
      v
Builder (LLM) ------- produces a theme.json mutation targeting the slot's
      |               declared --inv-* CSS variables
      |               outputs: { mutation: Partial<ThemeJson>, explanation }
      v
Verification -------- deterministic test functions (no LLM)
      |               palette / contrast / font allowlist / XSS / layout rules
      |               fail? --> retry Builder (max 2)
      v
Store + Apply ------- save theme.json, write --inv-* to :root
```

Every request runs two agents: a **Gatekeeper** that classifies and validates intent, and a **Builder** that produces the actual change. Verification is deterministic — no LLM judges invariant compliance. Retries on verify failure go to the Builder only.

F1 style edits work through `--inv-*` CSS variables written to `:root`. The scanner rewrote your hardcoded Tailwind classes to `var(--inv-*)` references during migration, so a variable change propagates to every element that uses it. No code rewriting at runtime.

Models:
- Gatekeeper + Builder: `claude-sonnet-4-6` (fast, JSON-only, temp 0.2).
- Scanner's one-shot semantic naming: `claude-opus-4-7` (better slot names, only called during migration).

---

## Config reference

After `invariance init` writes it, `invariance.config.yaml` looks like:

```yaml
app: "my-app"
frontend:
  design:
    colors:
      mode: "palette"                    # Builder may only produce colors from this list
      palette: ["#1a1a2e", "#ffffff", "#e94560"]
    fonts:
      allowed: ["Inter", "system-ui"]    # Font-family allowlist
    spacing:
      scale: [0, 4, 8, 12, 16, 24, 32, 48, 64]
  structure:
    required_sections: ["sidebar", "main-content"]
    locked_sections: ["auth-gate"]       # Builder may never touch these
    section_order: { first: "header", last: "footer" }
  accessibility:
    wcag_level: "AA"
    color_contrast: ">= 4.5"
    all_images: "must have alt text"
  pages:
    "/": { level: 0 }                    # Locked by default
    "/dashboard": { level: 4, required: ["deals-view"] }
theme_prefix: "--inv-"                   # Optional. Alias if you already use another token namespace
```

**`theme_prefix`** is the seam for projects that already ship design tokens. Set it to `"--fl-"` and the scanner emits `--fl-sidebar-bg` etc. instead of the default `--inv-*`. The runtime and Builder both honor whatever prefix the config declares.

---

## Storage & API proxy

Storage controls how each user's `theme.json` is persisted. Pick one and pass to the provider (generated `providers.tsx` uses `localStorage` by default):

| Backend | Use case |
|---------|----------|
| `memory` | Per-session, forgotten on reload. |
| `localStorage` | Per-browser. The default. |
| `api` | Server-persisted. You provide a REST endpoint. |

### Custom API storage

`createApiStorage` hits your endpoint with `GET /theme/:userId` and `PUT /theme/:userId`. Minimal handler:

```ts
// app/api/theme/[userId]/route.ts
import { NextRequest, NextResponse } from 'next/server'

const store = new Map<string, unknown>()   // swap for your DB

export async function GET(_: NextRequest, { params }: { params: { userId: string } }) {
  return NextResponse.json(store.get(params.userId) ?? null)
}

export async function PUT(req: NextRequest, { params }: { params: { userId: string } }) {
  store.set(params.userId, await req.json())
  return NextResponse.json({ ok: true })
}
```

Then in `providers.tsx` replace `storage="localStorage"` with an `api` storage built via `createApiStorage({ baseUrl: '/api/theme' })`.

### Proxying the Anthropic API (recommended for production)

For any production-facing deployment, don't ship `NEXT_PUBLIC_ANTHROPIC_DEV_API_KEY` — proxy the Gatekeeper/Builder calls through your own route. Point the provider at your endpoint via its `apiBaseUrl` / equivalent seam. (Proxy helper template is out of scope for MVP; use a standard Next.js route handler that forwards to `https://api.anthropic.com/v1/messages` with your server-side key.)

---

## Programmatic API

The scanner pipeline is importable for advanced flows (custom CI, caching, incremental re-scans):

```ts
import { analyze, writeMigration, migrate } from 'invariance/scanner'

const result = await analyze({ appRoot: '/path/to/app', apiKey: '', dryRun: true })
// result.project is a ts-morph Project with edits in-memory.
// result.diff is the unified-diff string.
// result.plan holds the generated config, initialTheme, slotCssVariables, warnings.

await writeMigration(result)              // commit to disk
// or: await migrate({ appRoot, apiKey, dryRun: false })
```

Type-only runtime imports (zero-bundle):

```ts
import type { InvarianceConfig, ThemeJson } from 'invariance'
```

---

## What's supported in this MVP

- ✅ F1 style (colors, fonts, spacing) via `--inv-*` CSS variables
- ✅ F2 content (text, labels, images via `data-inv-id`)
- ✅ F3 layout (reorder sections, hide optional ones)
- ✅ F4 component swap (from a registered library)
- ✅ Deterministic verification (palette, contrast, font allowlist, XSS checks, layout constraints, component allowlists)
- ✅ Per-user storage: memory / localStorage / REST API
- ✅ Idempotent migration — re-running the scanner on a migrated app is blocked

**Not yet:**

- ❌ F5+ source-code changes via Builder
- ❌ Invariant-change UI (developers currently edit `invariance.config.yaml` directly)
- ❌ Hosted multi-tenant storage (BYO backend via `api` storage)
- ❌ Per-slot palette overrides (single global palette for MVP)
- ❌ `invariance new` scaffolder — MVP assumes an existing app

---

## Troubleshooting

**"Scanner: X appears already migrated"**
You ran `init`/`scan --apply` twice. The scanner refuses to re-process sources containing `from 'invariance'` imports or `var(--inv-*)` refs — re-running would produce a degenerate palette. Use `invariance unlock` to adjust levels, or revert your source before re-scanning.

**"could not auto-patch src/app/layout.tsx"**
Your layout has a non-standard shape (no `{children}` expression, or the file uses an unusual export pattern). The scanner prints a copy-paste snippet — add the `Providers` import and wrap `{children}` manually.

**Customization panel does nothing / "Anthropic API error"**
Make sure `NEXT_PUBLIC_ANTHROPIC_DEV_API_KEY` is set and restart `next dev` (Next.js bakes env vars at build time). Open the browser devtools → Network tab and look for requests to `api.anthropic.com`.

**Tailwind arbitrary values not rewritten**
The scanner only rewrites values it can resolve — named Tailwind classes through your config, or explicit arbitrary hex/px/font values. Computed or dynamic classes (`bg-${color}`) are skipped and reported in `.invariance-migration-report.md`.

---

## Developing Invariance itself

This repo is a pnpm monorepo. Layout:

```
invariance/
├── packages/core/           # The `invariance` npm package
│   ├── bin/invariance.ts    # Single CLI entrypoint
│   ├── src/                 # Runtime: primitives, provider, panel, agents, verify, storage
│   └── src/scanner/         # Scanner: discover, ast, plan, emit, cli, migrate
└── apps/demo/               # Local test app (branch `demo-clean` has the unmigrated version)
```

```bash
pnpm install
pnpm --filter invariance run build
pnpm --filter invariance run test            # vitest, 147 tests
node packages/core/dist/bin/invariance.js init ./apps/demo
pnpm dev                                      # cd apps/demo && next dev
```

To smoke-test a published package locally:

```bash
pnpm --filter invariance pack
# creates packages/core/invariance-0.1.0.tgz
cd /tmp && npx create-next-app@14 --ts --tailwind --app demo-test && cd demo-test
npm install /abs/path/to/invariance-0.1.0.tgz
npx invariance init .
```

---

## License

MIT
