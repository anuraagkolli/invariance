# Invariance — System Design & v1 Repo Plan

Repo: `~/Documents/projects/invariance`

> **Superseded framing — read this first.** This is the original v5 *system
> design* (the architecture skeleton: schema / client / server / control-plane /
> console / cli). It remains an accurate map of the **as-built substrate we
> reuse**, but its **product framing is superseded** by
> [`DESIGN-GOVERNED-CUSTOMIZATION.md`](./DESIGN-GOVERNED-CUSTOMIZATION.md) (the
> active design): the GTM is now **governed customization for multi-tenant
> platforms** (sub-brands under one roof — SaaS tenants, marketplace sellers,
> creators), not consumer scale; **design-plane theming is the MVP**, with the
> API-seam hooks plane
> (Tier 1 below) **deferred**; and onboarding is **non-invasive** (SDK +
> `variable→role` map, never edits source), not the AST `init` codemod described
> below. Treat the architecture here as substrate; treat the new doc as canon.

## Locked decisions (from discussion)
- **v1 scope:** Tier 0 (client-side UI overlay) + Tier 1 (API-seam hooks via server middleware). Tier 2 (in-code declared extension points) deferred.
- **Stacks:** React gets the first-class client SDK; framework-agnostic script-tag build as fallback. Server SDK ships Express + Next.js adapters.
- **Scale target:** millions of individual end users (consumer). Same machinery serves org-level (B2B2B) customers with eager verification turned up.
- **Hosting split:** control plane (authoring, verification, registry, signing, analytics, dev console) in our infra; data plane (SDK runtimes) entirely in the customer's infra. No production request transits our systems — mod bundles are static signed artifacts on CDN.
- **Mod format:** signed, constrained artifacts — declarative UI override ops + sandboxed hook modules + a capability manifest — never arbitrary diffs.
- **Migration model:** lazy. Mods bind to versioned contracts; re-validated at next session after a developer release; incompatible mods degrade to base behavior with a one-click AI re-fix.

## System architecture

### 1. `packages/schema` — shared contracts (the keystone package)
Zod schemas + TS types used by every other component:
- **App Manifest:** design tokens, component inventory, API endpoint schemas, developer invariants/policies, manifest version. Published by the customer's build via CLI.
- **Mod Bundle:** UI override operations (token overrides, style/layout patches, component slot swaps), hook modules (source for sandboxed request/response transforms), **capability manifest** ("reads endpoint X, writes field Y"), bindings to manifest versions.
- **Signing:** ed25519-signed bundle envelope; runtimes execute only verified-and-signed bundles.

### 2. `packages/client` — client SDK (Tier 0)
- React provider + vanilla/script-tag build (shared core).
- Mod loader: fetch signed bundle from CDN, verify signature, cache per user+version.
- UI override engine: design-token theming, scoped style/layout patching, component slot overrides (React build only).
- Prompt widget: end-user "customize" UI → sends prompt to control-plane authoring API.
- Async telemetry emitter (off the request path).

### 3. `packages/server` — server SDK (Tier 1)
- Middleware adapters (Express, Next.js) wrapping the customer's API seam.
- Hook executor: QuickJS-compiled-to-WASM sandbox (portable across Node/edge), hard CPU/memory/time budgets per hook.
- Capability enforcement: a hook can only touch the endpoints/fields its verified capability manifest declares.
- Per-mod kill switch via flag updates from the registry.

### 4. `apps/control-plane` — modular monolith (Node/TS, Postgres)
Deliberately one deployable with internal module boundaries (authoring / verification / registry / analytics) — split into services later if needed.
- **Authoring:** prompt + app manifest → candidate mod via Claude API, with the verifier in the generation loop (generate → verify → repair).
- **Verification:** static analysis of hook source, capability extraction, contract checks against endpoint schemas, policy engine evaluating developer invariants → sign on pass.
- **Registry:** per-user mod versions, manifest-version bindings, bundle publishing to CDN, lazy-revalidation endpoint, kill-switch flag distribution.
- **Analytics:** event ingestion + mod classification (by surface touched + capabilities used) + aggregate queries. Postgres for v1; ClickHouse later.

### 5. `apps/console` — developer dashboard (Next.js)
Manifest viewer, invariant/policy editor, per-user mod browser with kill switches, analytics views ("what are users changing, where, why").

### 6. `packages/cli`
- `init`: **(superseded — see [`DESIGN-GOVERNED-CUSTOMIZATION.md`](./DESIGN-GOVERNED-CUSTOMIZATION.md) §9)** onboarding is now *non-invasive*: connect + scan the app's design **variables**, propose a `variable→role` map + baseline theme, emit the manifest/design-config — never edits source. (Originally specced as an AST codemod that rewrote the repo; that approach is retired.)
- `manifest publish`: push manifest version at build time.
- `dev`: local authoring/verification loop against a local control plane.

### 7. `apps/demo`
Small consumer-style app (media-browsing flavor) integrated end to end. Doubles as the living integration test for every phase.

### Key flows
- **Authoring:** user prompt → authoring → verification → signed bundle → registry/CDN → client loads → overlay + hooks active.
- **Developer release:** new manifest version → registry marks affected bindings stale → next user session revalidates → pass / degrade-to-base / offer AI re-fix.
- **Analytics:** telemetry + capability manifests → classification → developer dashboard.

## Repo layout (new repo, pnpm workspaces + Turborepo, TypeScript throughout)
```
/packages/schema      /packages/client      /packages/server      /packages/cli
/apps/control-plane   /apps/console         /apps/demo
```

## Build phases
1. **Foundations:** scaffold monorepo (pnpm, Turborepo, tsconfig, vitest, CI); implement `schema` (manifest, mod bundle, signing) with tests.
2. **Tier 0 vertical slice:** client SDK overlay engine + demo app + stub registry serving a hand-written signed bundle. *Exit criteria: a hardcoded mod restyles the demo app.*
3. **Authoring + verification v0:** prompt → Claude-generated UI mod → static verification + signing → live in demo. *Exit criteria: type a prompt, the app changes.*
4. **Tier 1:** server middleware + QuickJS sandbox + capability enforcement; extend authoring/verification to hooks. *Exit criteria: a prompt rewires a demo workflow at the API seam.*
5. **Versioning + lazy migration:** manifest versioning, staleness marking, degrade-to-base, AI re-fix path. *Exit criteria: ship a breaking demo-app change; mods degrade gracefully and re-fix.*
6. **Analytics v0 + console:** ingestion, classification, dashboard with kill switches.

## Risks to watch
- **Sandbox is a security boundary:** the Tier 1 hook executor gets its own adversarial test suite (escape attempts, capability bypass, resource exhaustion) from day one.
- **Authoring quality:** verifier-in-the-loop generation is mandatory; raw one-shot generation will not clear invariants reliably.
- **LLM cost at consumer scale:** per-developer metering/quotas built in from phase 3, not retrofitted.

## Distribution model (clarified)
- Source of truth for all mod versions/history lives in the control-plane registry (our infra). The developer's infra stores nothing durably.
- Distribution is two-step: a short-TTL mutable pointer per user ("active modset = hash X") + immutable content-addressed signed bundles on CDN. Kill switches, rollbacks, and lazy-migration downgrades propagate via the pointer.
- Prod path touches only static CDN artifacts + local signature check; control-plane downtime never breaks the customer app; any fetch/verify failure fails open to base behavior.
- Post-v1 option: enterprise bundle mirroring into the customer's own CDN/bucket (signatures make trust independent of who hosts the bytes).
