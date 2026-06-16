# Invariance

A platform that lets **multi-tenant platforms** — a B2B SaaS vendor, a
marketplace, a creator platform: any app with sub-brands under one roof — offer
*governed, natural-language customization* of their product. The platform's
tenants reshape the look (and, in the deferred enterprise tier, business logic
at the API seam) through plain-language prompts, while the platform stays in
control via declared invariants.

Developers integrate an SDK and publish an **App Manifest** (design tokens,
components, API endpoint schemas, policies). Tenants describe changes in plain
language; the control plane generates the customization — a per-tenant theme, or
a **Mod Bundle** (declarative UI ops + sandboxed API-seam hooks + a capability
manifest) — verifies it against the manifest's invariants, signs it (bundles
only), and distributes it as an immutable CDN artifact. Runtimes in the
developer's infrastructure execute only verified (and, for bundles, signed)
artifacts and fall back to base behavior on any failure.

**Canonical product + system design:**
[docs/DESIGN-GOVERNED-CUSTOMIZATION.md](docs/DESIGN-GOVERNED-CUSTOMIZATION.md) —
Tier-A governed theming is the current MVP/wedge; the business-logic plane is
deferred. The original v5 two-plane architecture (the as-built substrate) is
[docs/DESIGN.md](docs/DESIGN.md).

## Layout

All six build phases are complete:

```
packages/schema   Shared contracts: App Manifest, Mod Bundle, signing, path/diff utils
packages/client   Client SDK: mod loader, UI override engine, prompt widget, telemetry
packages/server   Server SDK: Express/Next middleware, QuickJS-on-WASM sandbox,
                  runtime capability + policy enforcement
packages/cli      `invariance` bin: init, manifest publish, local dev control plane
packages/design   Design plane (@invariance/design): OKLCH role engine, theme
                  compiler + verifier, runtime variable apply, prompt pipeline
packages/design-schema  Design contracts: role tokens, StyleSpec, design-config
apps/control-plane  Authoring (qwen2.5 via Ollama by default, Anthropic opt-in;
                  verifier in the loop), deterministic verification, registry +
                  lazy migration, analytics
apps/console      Developer dashboard: manifest, mods w/ kill switches, analytics
apps/demo         Netflix-style demo app, living integration test for every phase
apps/nebula       Nebula — Next.js + Tailwind showcase demo; design-plane
                  customization in-app, its API governed by the platform's
                  invariants (business-logic plane)
```

## Quick demo

**Fastest path (Nebula showcase stack):** `pnpm demo` brings the whole stack up in
the right order (control plane :4400 → seed → Nebula :4321 → Console :4600) and
prints the URLs; `pnpm demo:stop` tears it down. See
[docs/DEMO-RUNBOOK.md](docs/DEMO-RUNBOOK.md) for the scripted walkthrough,
prerequisites, the surface/URL table, and manual bring-up if you need it.

**Authoring backend (for free-form prompts).** The control plane needs one
OpenAI-compatible LLM endpoint — Ollama / vLLM / LM Studio / OpenRouter
(`INVARIANCE_LLM_BASE_URL` + `INVARIANCE_LLM_MODEL`; default `qwen2.5` — pull it
first, and run Ollama with `OLLAMA_CONTEXT_LENGTH=16384` since the manifest is
embedded in the prompt) — or Anthropic (`ANTHROPIC_API_KEY`). Storage is
in-memory by default; set `DATABASE_URL` (+ persistent `INVARIANCE_SIGNING_*`
keys) for a durable registry.

The console (`pnpm -F @invariance/console dev`, :4600) now defaults to appId
"nebula": its Guardrails view tests Nebula's invariants live, the Themes view
(`#/themes`) shows each user's theme version history with one-click rollback, and
the Invariants view (`#/invariants`) edits the look-invariants from the manifest.

Then click **✨ Customize** in the demo and type things like *"make the accent
color teal"*, *"sort shows by rating"*, or *"always add shows to my list at top
priority"* — UI mods apply instantly; hook mods rewire the API seam under
sandbox + capability enforcement. Watch mods, prompts, and kill switches in
the console.

## Development

```sh
pnpm install
pnpm test        # turbo run test (vitest)
pnpm typecheck   # turbo run typecheck
```

> Note: this repo's earlier history (no longer tagged) is the previous
> iteration — Invariance v4 (theme.json / CSS-variable architecture). v5 is a
> ground-up rebuild on the signed-bundle architecture.
