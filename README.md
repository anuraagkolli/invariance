# Invariance

A platform that lets end users of existing web apps customize them — UI and
business logic — through natural-language prompts, while developers stay in
control via declared invariants.

Developers integrate an SDK and publish an **App Manifest** (design tokens,
components, API endpoint schemas, policies). End users describe changes in
plain language; the control plane generates a **Mod Bundle** (declarative UI
ops + sandboxed API-seam hooks + a capability manifest), verifies it against
the manifest's invariants, signs it, and distributes it as an immutable CDN
artifact. Runtimes in the developer's infrastructure execute only verified,
signed bundles and fall back to base behavior on any failure.

Full system design: [docs/DESIGN.md](docs/DESIGN.md).

## Layout

All six build phases are complete:

```
packages/schema   Shared contracts: App Manifest, Mod Bundle, signing, path/diff utils
packages/client   Client SDK: mod loader, UI override engine, prompt widget, telemetry
packages/server   Server SDK: Express/Next middleware, QuickJS-on-WASM sandbox,
                  runtime capability + policy enforcement
packages/cli      `invariance` bin: init, manifest publish, local dev control plane
apps/control-plane  Authoring (Claude w/ verifier in the loop), deterministic
                  verification, registry + lazy migration, analytics
apps/console      Developer dashboard: manifest, mods w/ kill switches, analytics
apps/demo         Netflix-style demo app, living integration test for every phase
apps/nebula       Nebula — Next.js + Tailwind showcase demo; design-plane
                  customization in-app, its API governed by the platform's
                  invariants (business-logic plane)
```

## Quick demo

```sh
pnpm install

# 1. Control plane — pick one authoring backend:
#    a) any OpenAI-compatible endpoint (Ollama, vLLM, LM Studio, OpenRouter).
#       Large context matters: the app manifest is embedded in the prompt, so
#       run Ollama with OLLAMA_CONTEXT_LENGTH=16384 or it truncates silently.
INVARIANCE_LLM_BASE_URL=http://localhost:11434/v1 \
INVARIANCE_LLM_MODEL=qwen2.5-coder:14b \
INVARIANCE_AUTHORING_MAX_ATTEMPTS=5 \
pnpm -F @invariance/control-plane dev
#    b) Anthropic API:
ANTHROPIC_API_KEY=sk-... pnpm -F @invariance/control-plane dev
#    Storage: in-memory by default; set DATABASE_URL (Postgres/Neon) for a
#    durable registry. Pair it with INVARIANCE_SIGNING_* keys so bundles
#    survive restarts.

# 2. Demo API (Express + Invariance middleware) and web app
pnpm -F @invariance/demo seed       # publish manifest + a seeded mod
pnpm -F @invariance/demo dev:api
pnpm -F @invariance/demo dev:web    # http://localhost:4501

# 3. Developer console
pnpm -F @invariance/console dev     # http://localhost:4600

# Nebula showcase demo (Next.js + Tailwind) — design-plane customization + the
# /dev menu, with its API governed by the platform's invariants:
pnpm -F @invariance/nebula seed      # publish the nebula manifest to the control plane
pnpm -F @invariance/nebula dev       # http://localhost:4321  (needs Ollama for free-form prompts)
```

The console (`pnpm -F @invariance/console dev`, :4600) now defaults to appId
"nebula" and its Guardrails view tests Nebula's invariants live.

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

> Note: this repo's history before the `v4-final` tag is the previous
> iteration (Invariance v4, theme.json/CSS-variable architecture). v5 is a
> ground-up rebuild on the signed-bundle architecture.
