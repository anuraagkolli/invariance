# Invariance — the invariants pipeline, end to end

*From "user types a prompt" to "the change is actually live," traced against the
real code with `file:line` citations so every claim is checkable. Produced by an
8-reader code trace + adversarial verification (3 independent critics confirmed
the two load-bearing claims: signing is gated behind the verifier at
`authoring/pipeline.ts:172`; the runtime keeps a hook's output only after all
checks pass at `server/runtime.ts:226`).*

> Maintenance: this doc describes enforcement semantics. If you change the
> authoring loop, the verifier, the signing/distribution path, the server
> runtime, or the design compiler/verifier, update this doc **and delete stale
> claims** — don't just append.

> **Upstream of everything here:** the pipelines below *assume* the app is already
> **onboarded**. In the current onboarding design that's the lightest possible
> touch — the app keeps theming through its own CSS variables, which Invariance
> **maps to role tokens and redefines per tenant**, and the vendor's invariants
> (locked brand vars, contrast floor, allowed modes) are declared once. **No source
> edits, no `<m.slot>` wrapping.** The slot-level / structural features described
> below (`m.slot`, F1–F4) are a deeper, **deferred** tier, not part of the current
> onboarding wedge. How an app reaches the onboarded state — the **onboarding /
> governed-theming pipeline** — is documented in
> [`ONBOARDING-PIPELINE.md`](./ONBOARDING-PIPELINE.md). *(Current design, not finalized.)*

## 1. The key insight: two planes, two "apply" moments

There isn't *one* invariants pipeline — there are two, and they answer "when is
the change actually implemented?" in fundamentally different ways:

| | **LOOK plane** (`@invariance/design`) | **BUSINESS-LOGIC plane** (control-plane + `@invariance/server`) |
|---|---|---|
| Changes | tokens, colors, fonts, layout profile, slots | API request/response *data* (filter/transform shows, featured…) |
| Runs where | the browser (+ SSR cookie mirror) | the customer's server, inside a QuickJS-WASM sandbox |
| Authoring brain | Gatekeeper + Designer LLM | qwen2.5 (Ollama) / Anthropic LLM |
| The gate | deterministic level-gate + `verifyV2` (7 tests) | deterministic `verifyBundleAgainstManifest` + Zod `superRefine` |
| Signed bundle? | **No** — theme JSON, stored + cookie-mirrored | **Yes** — ed25519 over canonical JSON, content-addressed |
| **When it goes live** | when `root.style.setProperty()` runs — *immediate paint* | when runtime sets `current = execution.result` — *per request, after crypto + capability checks* |
| Failure mode | drop theme → base CSS wins | fail-open → original payload returned |

The shared philosophy, and the thing that makes this design work: **the LLM is in
the loop, never in the gate.** The model only *proposes*; what's enforced is
enforced by deterministic TypeScript + crypto.

---

## 2. Plane A — the Look / Design pipeline

**Shape:** `prompt → gatekeeper (level-gate) → Designer LLM → StyleSpec →
compiler → verify → apply to :root`. All client-side, live.

Entry is `runPipeline` (`packages/design/src/agent/pipeline.ts:114`), driven from
the `CustomizationPanel` widget mounted in Nebula.

1. **Prompt submitted** with conversation history + a `PipelineContext` (slot
   registry, config, derived constraints) — `pipeline.ts:114`.
2. **Gatekeeper — deterministic level-gate, LLM only classifies.**
   `callGatekeeper` (`gatekeeper.ts:109`) asks the LLM to *classify* intent
   (THEME, SLOT_F1–F4, CLARIFY, REJECT). That classification is **advisory**; the
   permission decision is pure TypeScript (`gatekeeper.ts:62-67, 194-201`):
   `allowedLevel = min(registered.level, page.level)`, and if the request's
   required level doesn't fit, it's rejected — the model's opinion can't override
   it. *(This is the level gate that used to misfire when slots registered with
   `pageName=''`; now fixed — slots register against the live page via
   `useCurrentPage()` in an effect keyed on `[page]`, `primitives/slot.tsx:80-90`.)*
3. **Designer LLM → StyleSpec.** `callDesigner` (`designer.ts:31`) produces a
   **StyleSpec — structured design intent with *no raw color values*** (mode,
   accentHue, accentChroma, contrast, density, radius, fontPairing…). Zod-parse
   failures feed back into a Designer retry.
4. **Compiler — StyleSpec → 38 role tokens.** `compileTheme`
   (`compiler/compile.ts:27`) deterministically derives color ramps, fonts,
   spacing, radii. **Invariants are enforced here, not by the LLM:**
   `allowed_modes` / `font_registry` / `locked_tokens` violations throw; **locked
   tokens are written last and override every computed value** (`compile.ts:80`).
   Contrast is solved by OKLCH binary search, and the developer floor can only
   *raise* the target — `primaryTarget = max(specTarget, constraints.contrast)`
   (`compiler/roles.ts:76`, re-checked in the verifier at
   `verify/compiled-tests.ts:157`).
5. **Layout profile.** `galleryProfile(spec)` (`agent/layout-profile.ts:15`) maps
   vibe axes (sharp + not-spacious → `'grid'`) to a structural preset merged over
   the user's pages — this is why "make it retro" swaps Nebula's carousels →
   grids, not just recolors them.
6. **Verify — the invariant gate.** `verifyV2` (`verify/compiled-tests.ts:391`)
   runs **7 deterministic tests**: spec validity, all 38 tokens present, locked
   tokens byte-identical, contrast pairs meet floor, accent chroma ≤ cap (ε=0.005
   gamut slack), fonts in registry, all `var(--inv-…)` resolve.
7. **Recompile-on-fail = Designer retry (never silent degrade).** A `verifyV2`
   failure turns the failed-test messages into `retryFeedback` and re-enters the
   **Designer** (`pipeline.ts:228-236`, `MAX_RETRIES=2`). **There is no path that
   relaxes a constraint or applies an unverified spec.**
8. **Apply — when it becomes visible.** All routes converge at `persistAndApply`
   (`pipeline-io.ts:30`): save → `themeStore.setTheme` → `applyAnyTheme`. **The
   change is visible the instant `applyThemeJsonV2` calls
   `root.style.setProperty(key, value)`** (`runtime/apply.ts:30-35`). Tokens
   repaint with zero React re-render (pure CSS cascade); slot swaps re-render via
   `useSyncExternalStore(themeStore.subscribe)` in `context/provider.tsx:174-178`
   and the F4 component swap in `primitives/slot.tsx:93-107`.
9. **Live reconciliation when the developer tightens an invariant.** Keyed on
   `constraintsHash`, `provider.tsx:162-171` re-verifies the *currently applied*
   theme; if it now fails but has a `styleSpec`, it **recompiles under the new
   constraints** (`reconcile-theme.ts:37-94`); otherwise it drops to base CSS.
   **Invariants win over the user's vibe, live, no reload.**

> **Look-plane answer to "when is it implemented":** at paint time, client-side,
> the instant `setProperty` runs — and only *after* the deterministic verify gate
> passed.

---

## 3. Plane B — the Business-logic pipeline (the novel part)

This is the half with signed bundles, the sandbox, and the deferred per-request
apply. It splits into **authoring** (control plane, where the bundle is *built*)
and **runtime** (data plane, where the change actually *takes effect*).

### 3a. Authoring: prompt → verified, signed bundle

Entry: `POST /v1/apps/:appId/subjects/:subjectId/prompts`
(`apps/control-plane/src/app.ts:184`) → `authorMod` (`authoring/pipeline.ts:85`).

1. **Request + agent.** Prompt validated (≤2000 chars); no LLM configured → HTTP
   503. Theme-ish prompts get routed to the design path instead via
   `createDesignAwareAgent` (`app.ts:124`).
2. **Load context** — current manifest + the subject's latest mod as
   `currentBundle` (`pipeline.ts:88-92`).
3. **Generate draft** — `agent.generateDraft({prompt, manifest, currentBundle,
   feedback})` → `{uiOps[], hooks[], capabilities?}`. On retries, prior verifier
   feedback is appended to the prompt.
4. **Assemble** — `assembleBundle` binds it to `manifest.version`, merges
   safe-default capabilities (`reads:[], writes:[], budgets:{cpuMs:50, memMb:32}`).
5. **Auto-repair under-declared writes.** `deriveRepairedWrites` (`pipeline.ts:115`,
   `derive-writes.ts`) parses each hook with **acorn**, walks the AST for the
   payload keys it actually writes, and widens the `writes` capability to cover
   them. *Why it exists:* weak models routinely under-declare `writes`, which the
   runtime would then discard as undeclared — a silent no-op. (The verifier below
   still rejects writes to *immutable* fields after the repair, so this can't
   over-grant.)
6. **Deterministic verifier — the gate** (`verification/index.ts:22`, literally
   commented "no LLM anywhere"). In order: manifest binding + `uiOps ≤ 200`; token
   existence + dangerous CSS/HTML rejection; capability→endpoint reference checks;
   hook legality via **AST static analysis** (`static-hooks.ts:109-183` — no
   `eval`/`Function`/`globalThis`/`process`/`require`/`fetch`, no
   `import`/`await`/`with`, single function, must return the whole payload);
   **immutable-field write containment** (rejects any declared write at-or-below an
   immutable path, allows strict ancestors); budget caps. (Zod `superRefine`
   already enforced hook→capability coverage at parse time,
   `schema/mod.ts:107-120`.)
7. **Verifier-in-the-loop.** `!verdict.ok` → reasons become `feedback`, loop
   retries (`pipeline.ts:128-132`, default `maxAttempts=3`). Also rejects
   **no-ops** (draft == current modset) and warns *once* on dropped
   customizations.
8. **Sign + publish — the apply moment for authoring.** Only after `verdict.ok`
   does `publishBundle` run (`pipeline.ts:172`). `signBundle`
   (`schema/signing.ts:42`) canonical-JSON-serializes (sorted keys at every
   depth), computes `contentHash = sha256(payload)`, and **ed25519-signs** →
   `SignedEnvelope`. The previous mod is marked `superseded`; the new `ModRecord`
   goes in as `active`. **The user's prompt is stored in `ModRecord.prompts`,
   never in the signed bundle** — bundles are CDN-public, prompts are PII.
9. **Distribution (two-step).** Immutable side: `GET /bundles/:hash` → the
   envelope, `cache-control: …immutable` (`app.ts:408`). Mutable side: a
   per-subject **pointer** (`registry.ts:126`) returns `status`
   (`active|stale|degraded|disabled|none`) + `contentHash`. Manifest publish marks
   active mods `stale` (lazy migration); the kill-switch flips `disabled`/`active`;
   **superseded mods cannot flip** (`registry.ts:212`).

### 3b. Runtime: real request → verified, sandboxed execution

A real request — e.g. Nebula's `GET /api/shows` wrapped by
`withInvariance(invarianceServerConfig, handler)`. (`appId:'nebula'` and
`getSubject: req => req.headers.get('x-demo-user')` live in
`apps/nebula/src/lib/invariance-server.ts:6-8`.)

1. **Subject + manifest + endpoint** resolved. No subject / no manifest → no
   transform, base behavior (fail-open).
2. **Resolve + verify the active bundle.** `getActiveBundle` (`runtime.ts:136`):
   `getPointer` with **`cache:'no-store'`** (critical — stops Next's Data Cache
   from serving a stale signing key and silently breaking *all* verification; this
   was a real bug). **Only `status==='active'` executes.** Then
   `verifyBundle(envelope, publicKeyPem)` (`signing.ts:69`) re-checks the sha256
   hash, ed25519-verifies the signature, and re-parses `ModBundleSchema`. Any
   failure → `null` → fail-open. *(An already-verified bundle is cached by
   `contentHash` and not re-verified per request — sound, since bundles are
   immutable.)*
3. **Sandboxed execution.** Each matching hook runs in a **fresh QuickJS-WASM
   runtime** with a memory cap + CPU-deadline interrupt, **no host bindings**,
   JSON-only across the boundary (`sandbox.ts:33-79`).
4. **Capability enforcement (per hook).** `checkCapabilityWrites` runs `diffPaths`
   and rejects any changed path not covered by a declared `write`
   (`enforce.ts:19`). On violation → emit `hook_capability_violation`, **discard
   that hook's output**, continue. A pure array reorder counts as a write to the
   array root, not its elements (`paths.ts:64`) — so "sort my list" passes without
   per-field wildcards.
5. **Field-constraint enforcement (whole chain).** `checkFieldConstraints`
   enforces **immutable fields by multiset**: canonical-sort the before/after
   value lists and compare — **reorder OK, any add/remove/rewrite rejected**
   (`enforce.ts:48`). **Any violation → return the ORIGINAL payload**
   (all-or-nothing fail-open).
6. **The apply line.** Only when a hook succeeded *and* the capability check passed
   *and* the field-constraint check passed does the runtime keep the value:
   **`current = execution.result` (`packages/server/src/runtime.ts:226`)**,
   returned at `:239`. Any exception anywhere → original payload (`:240-242`).

> **Business-logic answer to "when is it implemented":** the bundle is *created*
> at sign-time (after the verifier passes), but the change *takes effect*
> per-request on the customer's server at `runtime.ts:226`, **only after**
> signature verification + per-hook capability bounding + whole-chain
> immutable-multiset check all pass. No production request ever transits
> Invariance infra.

---

## 4. The novel part, zoomed in — *"when is the change actually made?"*

Two distinct apply moments; different safety story for each.

**Look plane** — exact line: `root.style.setProperty(key, value)` in
`applyThemeJsonV2` (`runtime/apply.ts:30-35`). Guarantees holding at that instant:
theme cleared `verifyV2` (apply is unreachable for a failing theme); locked tokens
byte-identical; contrast floor + chroma cap satisfied (floors only rise); on later
invariant change, the live theme is recompiled-or-dropped. Fail-open = base CSS.

**Business-logic plane** — exact line: `current = execution.result`
(`runtime.ts:226`). Guarantees holding at that instant: **signature + hash +
schema verified** before any hook ran (satisfies the core invariant *"runtimes
execute only signed, verified bundles"*); only `active` pointers execute;
**capabilities bounded** (undeclared writes discarded); **immutable multiset
preserved** (reorder-only); **budgets enforced** by the sandbox; **fail-open
everywhere**.

**Why it's safe:** the LLM never decides what's enforced. The *same* `diffPaths` /
path-containment semantics run at verify-time and run-time (defense in depth), and
the two-step distribution means a kill-switch or supersession propagates within
the pointer TTL while bundles stay cacheable forever.

---

## 5. Combined diagram

```
                              USER PROMPT
                                  │
              classify: theme/look?  ──vs──  logic/data?
        ┌─────────────────────────┘            └─────────────────────────┐
   ┌────▼─────────┐                                      ┌────────────────▼────────────┐
   │  LOOK PLANE  │  (client, live)                      │   BUSINESS-LOGIC PLANE       │
   └────┬─────────┘                                      │   POST …/subjects/:id/prompts │
        │                                                └────────────────┬────────────┘
  Gatekeeper LEVEL-GATE (deterministic)                  LLM draft: uiOps + hooks + caps
  + LLM classify (advisory)                                       │
        │                                              deriveRepairedWrites (acorn AST)
  Designer LLM → StyleSpec (no colors)                            │
        │                                              ╔══════════▼══════════╗  retry≤3
  Compiler → 38 tokens (OKLCH contrast, locked,         ║  VERIFY GATE         ║◄── (verifier-
  chroma cap)                                           ║  deterministic, NO LLM║    in-loop)
        │                                              ╚══════════╦══════════╝
  ╔═════▼══════════╗  retry → Designer (≤2)                       │ ok
  ║  verifyV2 gate ║◄───                                ╔═════════▼═════════╗
  ║  (7 tests)     ║                                    ║ SIGN: canonical    ║  prompt→ModRecord
  ╚═════╦══════════╝                                    ║ JSON + ed25519     ║  (never in bundle)
        │ pass                                          ╚═════════╦═════════╝
  persistAndApply → applyAnyTheme                       DISTRIBUTE: CDN immutable@hash
        │                                               + pointer (~5s TTL, active|stale|disabled)
  ╔═════▼══════════════╗                                          │
  ║ APPLY (LOOK):       ║                               real API request → withInvariance
  ║ setProperty(:root)  ║                                          │
  ║ → PAINT             ║                               fetch pointer (no-store); active only
  ╚════════════════════╝                                          │
  visible immediately                                  ╔══════════▼═══════════╗  fail → null
                                                        ║ verifyBundle:        ║  → fail-open
                                                        ║ hash+ed25519+schema  ║
                                                        ╚══════════╦═══════════╝
                                                       QuickJS sandbox (budgets, no host)
                                                                   │
                                                       checkCapabilityWrites (per hook)
                                                       checkFieldConstraints (immutable multiset)
                                                                   │
                                                        ╔══════════▼═══════════════╗  any
                                                        ║ APPLY (LOGIC):            ║  violation
                                                        ║ current = execution.result║  → original
                                                        ║ (runtime.ts:226) → resp   ║  (fail-open)
                                                        ╚══════════════════════════╝
                                                       effective for THIS request
```

---

## 6. Things worth confirming (gaps / sharp edges the trace surfaced)

- **Signing-key durability.** Without `INVARIANCE_SIGNING_*` env, keys regenerate
  on every control-plane restart → every existing bundle fails verification →
  **universal silent no-op**. The `cache:'no-store'` fix closes the *stale-cache*
  version of this, but key persistence in prod is still an open hand-off footgun.
- **Auto-repair widens declared writes.** The signed bundle's final `writes` set
  is partly machine-inferred by acorn. Safety rests *entirely* on the verifier's
  immutable-field check running on the *repaired* bundle (it does,
  `pipeline.ts:120-128`) — worth a targeted test that confirms inference can't
  over-grant past an immutable boundary.
- **Two look-plane verifiers.** THEME/SLOT_F1 use `verifyV2` (7 tests); F2/F3/F4
  use the older v5 `verify` engine (`verify/engine.ts:30`). Confirm they enforce
  the same invariants where they overlap.
- **Kill-switch latency.** A `disabled` mod can keep executing until the cached
  pointer expires (~5s, a data-plane runtime cache property — `runtime.ts:66-68`).
- **One-shot drop warning.** After warning once, a weak model is *trusted* to drop
  existing customizations (`pipeline.ts:157-169`) — intentional (prevents
  non-convergence), but a user's prior ops can legitimately disappear on attempt #2.
- **`fields:undefined` vs `fields:[]`.** Omitted = whole-body write (allowed unless
  the endpoint has immutable fields); empty array = explicitly rejected.
- **Error/GET gaps.** `statusCode ≥ 400` responses are never transformed, and GET
  endpoints reject request-phase hooks.
