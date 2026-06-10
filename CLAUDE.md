# CLAUDE.md — Invariance v5

## Project Overview

Invariance lets end users of existing web apps customize them through natural-language prompts — UI (tokens, styles, slots) and business logic at the API seam — while developers stay in control via declared invariants. Full design: `docs/DESIGN.md`.

History note: everything before the git tag `v4-final` is the previous iteration (theme.json + CSS-variable architecture, scanner codemod). v5 is a ground-up rebuild; the v4 scanner and verification ideas may be ported where they fit.

## Architecture (two planes)

- **Control plane (our infra):** authoring (prompt → mod via Claude, verifier in the generation loop), verification (static analysis → capability extraction → contract checks → policy engine), registry (per-user mod revisions, CDN publishing, kill-switch flags), analytics. Modular monolith in `apps/control-plane`.
- **Data plane (customer infra):** client SDK (mod loader, UI override engine, prompt widget) and server SDK (Express/Next middleware, QuickJS-on-WASM sandboxed hook executor with capability enforcement). No production request ever transits our systems.

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
| Sandbox (phase 4) | QuickJS compiled to WASM |
| LLM (phase 3) | Anthropic API |

## Layout & Phase Status

```
packages/schema     # DONE (phase 1): AppManifest, ModBundle, capability manifest, signing
packages/client     # phase 2: mod loader, UI override engine, prompt widget
packages/cli        # phase 2+: integration codemod, `manifest publish`
apps/demo           # phase 2: demo app, living integration test
apps/control-plane  # phase 3+: authoring, verification, registry, analytics
packages/server     # phase 4: middleware adapters, sandboxed hook executor
apps/console        # phase 6: developer dashboard
```

Phases (exit criteria in `docs/DESIGN.md`): 1 foundations/schema ✅ · 2 Tier-0 vertical slice · 3 authoring+verification v0 · 4 Tier-1 hooks/sandbox · 5 versioning+lazy migration · 6 analytics+console.

## Conventions

- Zod schema first; export both `XSchema` and `type X = z.infer<typeof XSchema>`.
- Workspace packages export TS source directly (`"exports": { ".": "./src/index.ts" }`); no build step until packages are published externally.
- Cross-schema integrity checks live in `superRefine` blocks (e.g. hooks must be covered by capabilities; policies must reference real endpoints) — keep these exhaustive, they are the first verification layer.
- Tests colocated per package under `test/`, run with `pnpm test` at root (turbo) or `pnpm -F @invariance/schema test`.
