# CLAUDE.md — Invariance v5

## Project Overview

Invariance lets end users of existing web apps customize them through natural-language prompts — UI (tokens, styles, slots) and business logic at the API seam — while developers stay in control via declared invariants. Full design: `docs/DESIGN.md`.

History note: everything before the git tag `v4-final` is the previous iteration (theme.json + CSS-variable architecture, scanner codemod). v5 is a ground-up rebuild; the v4 scanner and verification ideas may be ported where they fit.

## Architecture (two planes)

- **Control plane (our infra):** authoring (prompt → mod via an LLM — **qwen2.5 via Ollama by default, Anthropic opt-in** — with the verifier in the generation loop), verification (static analysis → capability extraction → contract checks → policy engine), registry (per-user mod revisions, CDN publishing, kill-switch flags), analytics. Modular monolith in `apps/control-plane`.
- **Data plane (customer infra):** client SDK (mod loader, UI override engine, prompt widget) and server SDK (Express/Next middleware, QuickJS-on-WASM sandboxed hook executor with capability enforcement). No production request ever transits our systems.

Two customization planes coexist: `@invariance/design` (UI/theme, client-side) and `@invariance/client`+`@invariance/server`+control-plane (signed-bundle business-logic at the API seam, with invariants). Nebula uses the design plane in-app; its API is governed by the business-logic plane.

Distribution is two-step: short-TTL mutable pointer per user → immutable content-addressed signed bundle on CDN. Any fetch/verify failure fails open to base app behavior.

Core invariants of the system itself:
- Runtimes execute **only** signed, verified Mod Bundles (`verifyBundle` before anything).
- Bundles are immutable; new revisions supersede via the registry pointer.
- User prompts never go into bundles (PII; bundles are CDN-public-ish). Prompts live control-plane-side.
- Verification is deterministic — no LLM in the verify step.
- Hooks run sandboxed with hard budgets and may only touch endpoints/fields declared in their capability manifest.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript, strict mode, ESM (`"type": "module"`) |
| Package manager | pnpm only (do not use npm or yarn) |
| Monorepo | pnpm workspaces + turborepo |
| Validation | zod (schemas are the source of truth, types via `z.infer`) |
| Signing | ed25519 via `node:crypto`, canonical JSON (sorted keys) |
| Testing | vitest |
| Sandbox | QuickJS compiled to WASM (externalize the `quickjs-emscripten` chain in Next hosts — see `apps/nebula/next.config.js`) |
| LLM (authoring) | qwen2.5 via Ollama (OpenAI-compatible) by default; Anthropic opt-in. NOT a hard dependency — see [[no-anthropic-models-for-now]] |
| UI (console + Nebula) | Tailwind; console adopts Nebula `/dev`'s fixed-neutral dark design language |

## Layout & Phase Status

```
packages/schema     # AppManifest, ModBundle, capability manifest, signing, path/diff utils
packages/client     # mod loader, UI override engine, prompt widget, telemetry
packages/cli        # `invariance` bin: init, manifest publish, dev control plane
apps/demo           # Netflix-style demo app, living integration test (e2e per phase)
apps/nebula        # Nebula — Next.js 14 + Tailwind showcase demo. Customization
                   # via the DESIGN plane (@invariance/design: CustomizationPanel,
                   # m.* slots, /dev menu). Business-logic mods + invariants run on
                   # the BUSINESS-LOGIC plane (Next API routes wrapped with
                   # @invariance/server withInvariance; appId "nebula"), demoed via
                   # the console/Guardrails. apps/demo (Streamline, Vite) is kept as
                   # the platform integration test.
apps/control-plane  # authoring, verification, registry + lazy migration, analytics
packages/server     # Express/Next middleware, QuickJS sandbox, runtime enforcement
apps/console        # developer dashboard + the SINGLE invariants surface: manifest,
                   # mods + kill switches, analytics, Guardrails (test enforcement live),
                   # and the Invariants view (#/invariants): read-only data-invariants
                   # (manifest policies) + editable look-invariants (design-config).
                   # Tailwind, /dev-style UI.
```

## Current state (2026-06-14)

Showcase demo is **Nebula** (`apps/nebula`, Next.js + Tailwind); **Streamline** (`apps/demo`,
Vite) is kept as the platform integration test (its `guardrails-catalog` e2e). The **Console**
is the single developer surface for invariants: *data* invariants (manifest policies) are
viewed + Guardrails-tested; *look* invariants are edited via the control-plane **design-config**
(`GET/PUT /v1/apps/:appId/design-config`), which Nebula reads per request and merges into its
live config. Two enforcement engines remain by design (design compiler for look; verifier +
sandbox for data). Per-effort design history lives in `docs/superpowers/specs/` + `…/plans/`.

**Recently shipped (2026-06-14, on `combined`):** SP2
(`docs/superpowers/plans/2026-06-14-sp2-theme-history-and-vocab.md`) — theme history + rollback
moved into the control plane (`theme_versions` store + `GET/PUT /v1/apps/:appId/themes`,
`…/themes/history`, `…/themes/rollback`) and the Console (`#/themes` view); Nebula reads/writes
themes there and its `/dev` page is **deleted**. The look-invariant vocabulary is now
manifest-driven via `AppManifest.designSurface` (the Console's per-app hardcode is gone).
Verified live end-to-end (qwen-free pack path + manifest-driven controls + edit round-trip).

**Remaining for demo-readiness (not built):** (1) reliable logic-hook authoring on weak models —
qwen can mis-declare a hook's `writes` capability, which the static verifier passes but the
runtime discards → silent no-op (the **theme** path is demo-reliable; in-app **logic** prompts
are not — the demo drives business-logic invariants developer-side via the Console/Guardrails,
not an in-app logic prompt); candidate fix: dry-run the hook to auto-derive/validate write caps.
(2) one-command demo mode + scripted runbook. (3) console polish: surface `bundle.design`
StyleSpec intent (`summarizeStyleSpec` still has zero consumers). (4) Nebula's home reads
`titles.ts` statically rather than its governed API. (5) clean-checkout/hand-off fragility (cold
start needs `pnpm -F @invariance/design build`; default model ids ≠ the pulled `qwen2.5:latest`;
per-process signing keys) — only matters for hand-off; deprioritized (demo runs live on this machine).

Phases (exit criteria in `docs/DESIGN.md`): 1 foundations/schema ✅ · 2 Tier-0
vertical slice ✅ · 3 authoring+verification v0 ✅ · 4 Tier-1 hooks/sandbox ✅ ·
5 versioning+lazy migration ✅ · 6 analytics+console ✅. Implementation notes
for 4–6 live in `docs/HANDOFF-PHASES-4-6.md`.

Enforcement semantics worth knowing (shared by verifier and server runtime):
- `diffPaths` treats a pure array permutation as a write to the array itself,
  not its element fields — so "sort my list" mods are possible.
- Immutable field policies compare the *multiset* of values at the path:
  reordering is legal; rewriting, adding, or hiding a protected value is not.
- The verifier rejects declared writes that target an immutable field
  (descendant-or-equal path) and whole-body writes on such endpoints, but
  allows strict-ancestor declarations (e.g. `shows`), relying on the runtime
  checks above.
- Middleware executes only `active` pointers; `stale` subjects get base API
  behavior until their next client session revalidates.

## Conventions

- Zod schema first; export both `XSchema` and `type X = z.infer<typeof XSchema>`.
- Workspace packages export TS source directly (`"exports": { ".": "./src/index.ts" }`); no build step until packages are published externally.
- Cross-schema integrity checks live in `superRefine` blocks (e.g. hooks must be covered by capabilities; policies must reference real endpoints) — keep these exhaustive, they are the first verification layer.
- Tests colocated per package under `test/`, run with `pnpm test` at root (turbo) or `pnpm -F @invariance/schema test`.
