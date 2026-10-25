# Handoff: implementing phases 4–6

Phases 1–3 are done (see git log and `docs/DESIGN.md` for the architecture).
This doc records the implementation decisions already made for the remaining
phases, so any session can continue without prior conversation context.
Forward-pointing stubs already exist in the code — search before building.

## Phase 4 — Tier-1 server SDK (`packages/server`, currently a stub)

**Sandbox:** `quickjs-emscripten` (already in package.json). One runtime per
hook execution: `runtime.setMemoryLimit(budgets.memMb * 1MB)`,
`runtime.setInterruptHandler` with a `Date.now() > deadline` check for
`budgets.cpuMs`. Marshal via JSON: build
`const __p = <json>; JSON.stringify((<fnExpr>)(__p))`, `ctx.evalCode`, parse
the result. Dispose context + runtime in `finally`.

**Hook source contract** (enforced by control-plane `analyzeHookSource`): a
single synchronous arrow/function expression, optionally prefixed
`export default `. Executor strips a leading `export default ` and treats the
rest as the function expression.

**Capability enforcement (runtime):** after a hook returns, diff the original
vs transformed payload (recursive walk producing changed dot-paths, array
indices become `*`... no: produce concrete paths, match with wildcards). Every
changed path must be covered by a declared `writes[].fields` entry for that
endpoint (wildcard `*` segments match anything; a `writes` entry with no
`fields` covers the whole body). Violation -> discard the hook's output, use
the original payload, emit a telemetry event. Reuse the `pathCovers` logic
from `apps/control-plane/src/modules/verification/index.ts` — move it into
`@invariance/schema` so both sides share it.

**Field-constraint runtime checks:** after hooks run, enforce min/max/enum/
pattern field-constraints from the manifest on the transformed payload
(verification already rejects `immutable` writes statically). Violation ->
fall back to original payload.

**Express middleware** `createInvarianceMiddleware(config)`:
- config: `{ registryUrl, appId, getSubject(req) (default: x-invariance-subject header), publicKeyPem?, cacheTtlMs? }`.
- Fetches manifest + signing key once (TTL cache), per-subject pointer with a
  short TTL cache; bundle by contentHash cached immutably; verify signature
  with `@invariance/schema/signing` before executing anything.
- Endpoint matching: `req.method` + path against manifest endpoint patterns
  (`:param` segments).
- Request phase: transform `req.body` before `next()`. Response phase:
  monkey-patch `res.json` to transform the body before sending.
- Only `status: "active"` pointers execute. Every failure (fetch, verify,
  sandbox, budget, capability) fails open to base behavior — never break the
  host app. Also export a fetch-style handler wrapper for Next.js routes.

**Demo wiring:** `createDemoServer({ middleware })` already takes a
middleware; `server/main.ts` should build it from env
(`INVARIANCE_REGISTRY`, default http://localhost:4400).

**Adversarial test suite** (the sandbox is a security boundary): infinite
loop -> interrupted within budget; memory bomb -> OOM error; `process`/
`require`/`fetch` undefined inside sandbox; undeclared field write ->
discarded; immutable/constrained field violation -> discarded; hook throwing
-> base behavior; budget from bundle respected. Exit criterion e2e: a hook on
`list-shows` response (e.g. reverse/sort items) visibly reorders what the
demo API returns, under enforcement.

## Phase 5 — versioning + lazy migration (mostly control plane)

Already done: manifest publish marks bound active mods `stale`; client loader
calls `POST .../revalidate` when it sees a stale pointer; `PromptWidget`
shows degrade banner + calls `POST .../refix`.

To build:
- `POST /v1/apps/:appId/subjects/:subjectId/revalidate`: take latest mod; if
  `stale`, parse its bundle, rebind to current manifest version, re-run
  `verifyBundleAgainstManifest`. Pass -> publish re-signed bundle (new record
  via `publishBundle`, carrying forward prompts) -> pointer active. Fail ->
  mark record `degraded` with reasons -> pointer `{status: "degraded", reasons}`.
  Not stale -> return current pointer unchanged. Emit events
  (`mod_migrated` / `mod_degraded`).
- `POST /v1/apps/:appId/subjects/:subjectId/refix`: requires agent; find the
  degraded record; call `authorMod` with a synthetic prompt like
  "Recreate the user's customizations under the new manifest. Original
  requests, in order: <prompts>" and `seedFeedback` = the degrade reasons.
  On success the new record supersedes; on failure 422 with reasons.
- Server middleware treats `stale` as executable? No — middleware only
  executes `active`; stale subjects get base API behavior until their next
  client session revalidates. Document this choice in the middleware.
- Exit criterion e2e: publish manifest v2 with a token renamed/removed ->
  pointer stale -> revalidate degrades with reasons -> refix (MockAgent)
  publishes a compliant bundle -> overlay applies again.

## Phase 6 — analytics + console + CLI

- `POST /v1/apps/:appId/events` (client telemetry already posts here;
  sendBeacon means no JSON content-type — parse body leniently). Store into
  `store.app(appId).events` (AnalyticsEvent type exists).
- Classification (pure function, control plane): from a ModBundle derive
  `{ surfaces: {tokens, styles, slots, hooks counts}, tokensTouched[],
  endpointsHooked[], phases }`.
- `GET /v1/apps/:appId/analytics/summary`: totals by event type, mod counts
  by status, top tokens touched, top endpoints hooked, top components
  overridden, recent prompts (from mod records), degraded count. Aggregate
  over all subjects.
- Mods admin: `GET /v1/apps/:appId/mods` (records w/ classification, minus
  envelope payloads), `POST /v1/apps/:appId/mods/:modId/kill` and `/restore`
  (use `setModStatus`).
- `apps/console`: minimal Vite React dashboard (no chart libs): manifest
  viewer, mods table with kill/restore buttons, summary panel. Proxy
  `/v1` -> http://localhost:4400.
- `packages/cli` (`invariance` bin, no arg-parsing deps): `manifest publish
  --file --registry --app`, `init` (scaffold invariance.manifest.json +
  integration instructions), `dev` (boot a local control plane via
  `@invariance/control-plane`).
- CI: GitHub Actions workflow (pnpm install, typecheck, test).
- Update README/CLAUDE.md phase status when done.

## Conventions reminders

- pnpm only; workspace packages export TS source directly; zod schema first;
  tests colocated under `test/`; deterministic verification (no LLM); user
  prompts never go into bundles. Commit per phase with the existing message
  style (`git log`), Co-Authored-By Claude trailer.
