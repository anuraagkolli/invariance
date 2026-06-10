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

```
packages/schema   Shared contracts: App Manifest, Mod Bundle, signing (phase 1 — done)
packages/client   Client SDK: mod loader, UI override engine, prompt widget (phase 2)
packages/server   Server SDK: middleware, sandboxed hook executor (phase 4)
packages/cli      Integration codemod, manifest publish (phase 2+)
apps/control-plane  Authoring, verification, registry, analytics (phase 3+)
apps/console      Developer dashboard (phase 6)
apps/demo         Demo app, living integration test (phase 2)
```

## Development

```sh
pnpm install
pnpm test        # turbo run test (vitest)
pnpm typecheck   # turbo run typecheck
```

> Note: this repo's history before the `v4-final` tag is the previous
> iteration (Invariance v4, theme.json/CSS-variable architecture). v5 is a
> ground-up rebuild on the signed-bundle architecture.
