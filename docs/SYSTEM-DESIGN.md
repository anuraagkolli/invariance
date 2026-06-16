# Invariance — System Design

*A single coherent picture of the whole system: the two customization planes, the
onboarding pipeline, and the control/data-plane split. Code citations (`file:line`)
are given for load-bearing claims so they're checkable.*

> Maintenance: this describes architecture and enforcement semantics. If you change
> the authoring loop, the verifier, the signing/distribution path, the server
> runtime, the design compiler/verifier, or the onboarding pipeline, update this doc
> **and delete stale claims** — don't just append.

---

## 1. What the system is

Invariance lets **end users of an existing web app** customize it through
natural-language prompts — both its **look** (tokens, layout, slots) and its
**business logic** (API request/response behavior) — while the app's **developer**
stays in control via declared **invariants**. The end user gets "change my app by
asking"; the developer gets a guarantee that no prompt can cross the lines they drew.

The entire design rests on one principle, applied everywhere:

> **The LLM proposes; deterministic TypeScript + crypto enforce. The model is in the
> loop, never in the gate.**

## 2. Non-negotiable invariants (the system's own contract)

These hold regardless of what any prompt or model produces:

1. Runtimes execute **only** signed, verified bundles (`verifyBundle` before anything runs).
2. Bundles are **immutable**; new revisions supersede via a registry pointer.
3. End-user **prompts never enter bundles** (PII; bundles are CDN-public). Prompts live
   control-plane-side only.
4. **Verification is deterministic** — no LLM in the verify step.
5. Hooks run **sandboxed**, with hard CPU/memory budgets, touching only the
   endpoints/fields in their capability manifest.
6. **Every failure fails open** to base app behavior — a broken/unverifiable/missing mod
   yields the original app, never an error surface.
7. **No production request ever transits Invariance infrastructure.**

## 3. Actors & trust boundaries

```
  END USER ──prompt──►  CONTROL PLANE (Invariance infra, TRUSTED authority)
 (least trusted          authoring · verification · registry · signing · CDN · analytics
  author of intent)              │
                                 │ signed bundle + pointer (over untrusted CDN)
                                 ▼
  DEVELOPER ──invariants──►  DATA PLANE (CUSTOMER infra, the party that must be protected)
 (defines the rules)         client SDK (browser) · server SDK (sandbox at API seam)
```

Three trust levels, and they explain every design choice:

- **End user** — authors *intent* via prompt. Untrusted. Their prompt drives an LLM, so
  what comes out is effectively attacker-influenced.
- **Control plane** — the *authority* that verifies and signs. Trusted, but offline from
  the request path.
- **Data plane (customer)** — the party that must be protected. Its server is where
  untrusted, end-user-originated code would execute, so it's where the crypto + sandbox live.

The signature is exactly the bridge that lets the **trusted authority** vouch for code to
the **protected party** across an **untrusted channel** (CDN).

## 4. The two customization planes

The system has two customization domains. They differ on **trust/threat model**, and
everything else (where they run, whether they're signed) follows from that.

| | **Look plane** | **Business-logic plane** |
|---|---|---|
| **Why it needs what it needs** | Self-affecting cosmetic change on the user's own device — no trust boundary crossed | Untrusted, end-user-originated **code executing on the developer's server** — must be contained |
| What changes | tokens, colors, fonts, layout profile, slots | API request/response *data* (filter/transform shows, featured…) |
| Output kind | declarative design values (CSS) | executable JS hooks + capability manifest |
| Runs where | browser (+ SSR cookie mirror) | customer server, inside QuickJS-WASM sandbox |
| Signed? | **No** — nothing to protect; consumer = affected party | **Yes** — ed25519 over canonical JSON, content-addressed |
| The gate | level-gate + `verifyV2` (7 deterministic tests) | `verifyBundleAgainstManifest` + Zod `superRefine` + AST static analysis |
| When it's live | `root.style.setProperty()` — immediate paint | `current = execution.result` — per request, after crypto + capability + field checks |
| Failure mode | drop theme → base CSS | fail-open → original payload |

**Why the business-logic plane carries so much more machinery (the real asymmetry).** A
logic mod is scoped to a single **subject** — it only runs on that user's requests and only
reshapes that user's responses, so its *data* blast radius is the requesting user, same as
the look plane. The danger isn't the transformed response; it's that the mod is **untrusted
code, generated from a user's prompt, executing on the developer's server**. Unsandboxed,
that code could read other users' in-memory/DB data, read secrets, call out to exfiltrate,
or DoS the box. The look plane never runs attacker-controlled code on trusted infra — it's
declarative CSS applied in the asking user's own browser. Hence: sandbox + capability
manifest + signing on the logic plane; none of it on the look plane.

Both domains keep two enforcement engines *by design*: a **design compiler/verifier** for
look, and a **verifier + sandbox** for logic.

## 5. Core domain model

```
AppManifest                 developer's declaration of the app + its rules
 ├─ designSurface           archetypes (route patterns) + sections + per-archetype levels  (look vocabulary)
 ├─ endpoints               the API seam points logic mods may touch
 ├─ policies                invariants: immutable fields, locked tokens, budgets, allowed modes
 └─ frontend.layout_profiles archetype → concrete layout preset mapping

StyleSpec        structured design intent, NO raw colors (mode, accentHue, chroma, contrast, density…)
ThemeJson        compiled look state: 38 role tokens + page/slot structure   (look plane, client)

ModBundle        a logic mod: { uiOps[], hooks[], capabilities{reads,writes,budgets} }, bound to manifest.version
 └─ SignedEnvelope  { bundle, contentHash=sha256(canonicalJSON), signature=ed25519 }

Registry
 ├─ pointer (per subject)   { status: active|stale|degraded|disabled|none, contentHash }   ← short TTL, mutable
 └─ ModRecord               { bundle, prompts[], state: active|superseded }                ← prompts live here, never in bundle
```

Subject = the end-user identity a mod is scoped to (e.g. `x-demo-user` in Nebula). A logic
mod only ever runs for **its own subject's** requests.

Note: the look plane uses two token counts that look contradictory but aren't — onboarding
assigns ~**27 role tokens** (the authored vocabulary), and the compiler derives **38 tokens**
(the full compiled output, including derived ramps/pairs).

## 6. Lifecycle — four stages

### Stage A — Onboarding (developer-time, once per app) — *design not finalized*

Turns a raw React+Tailwind app into a *governable* one. Deterministic discovery, LLM
proposes names, deterministic gate verifies, developer reviews a PR. Scope this round:
React + Tailwind only.

```
un-wired app
  → [det] discover archetypes (file routes; a dynamic segment [id] = 1 archetype)
  → [det+LLM] per-archetype: AST finds sections, LLM proposes names/levels/layout grammar, cluster palette
  → [det] reconcile palette → role tokens, seed default theme from observed colors  (barrier)
  → [det] generate artifacts: tailwind.config, invariance.manifest.json, layout.ts, config wiring
  → [det] codemod: bg-red-600 → bg-accent, <section> → <m.slot>, mount provider+widget
  → [gate] verify: build + verifyV2 + layout verifier + visual-QA (render == before on default theme)
  → reviewable PR → developer merges
OUTPUT: three centralization layers — Token, Archetype, Layout
```

This is the **precondition** for everything below: it produces the role tokens, the slot
registry, and the manifest that the runtime planes consume. The fan-out shape (per-archetype,
per-file) means wall-clock ≈ the slowest single unit, not the sum.

### Stage B — Authoring (runtime, per prompt → control plane)

Entry: `POST /v1/apps/:appId/subjects/:subjectId/prompts` (`apps/control-plane/src/app.ts`)
→ `authorMod` (`authoring/pipeline.ts`).

```
prompt (≤2000 chars; no LLM configured → 503)
  → route theme-ish prompts to design path; else logic path
  → LLM generateDraft → { uiOps, hooks, capabilities }
  → [det] deriveRepairedWrites (acorn AST widens under-declared writes)
  → [GATE] verifyBundleAgainstManifest: manifest binding + uiOps≤200, token/CSS safety,
            capability→endpoint refs, hook legality via AST (no eval/Function/globalThis/
            process/require/fetch/import/await/with; single fn; must return whole payload),
            immutable-field write containment (reject at-or-below; allow strict ancestor),
            budget caps   ── "no LLM anywhere"
  → verifier-in-the-loop (reasons → feedback → retry, default maxAttempts=3); reject no-ops
  → SIGN: canonical JSON (sorted keys) → sha256 contentHash → ed25519  (prompt → ModRecord, never the bundle)
  → publish: previous mod superseded, new mod active
```

### Stage C — Distribution (two-step, time-decoupled)

```
mutable side:    per-subject POINTER (status + contentHash), short TTL (~5s)
immutable side:  GET /bundles/:hash → SignedEnvelope, cache-control: immutable (cache forever)
controls:        manifest publish → active mods become `stale` (lazy migration)
                 kill-switch → flips disabled/active; superseded mods cannot flip
```

A version bump = flip a small pointer; the heavy content stays cached at its hash. Tamper
with the bytes → hash changes → signature fails → fail-open.

### Stage D — Enforcement (runtime, per request → data plane)

**Look (browser).** Entry `runPipeline` (`packages/design/src/agent/pipeline.ts`):

```
Gatekeeper level-gate (LLM classify is advisory; allowedLevel = min(slot.level, page.level) is law)
  → Designer LLM → StyleSpec (no raw colors)
  → compileTheme → 38 role tokens (locked tokens written last & win; OKLCH contrast floor only RISES; chroma cap)
  → layout profile (sharp+not-spacious → grid)
  → verifyV2 (7 tests; fail → retryFeedback → Designer, MAX_RETRIES=2; never silent-degrade)
  → persistAndApply → setProperty(:root) → PAINT (visible immediately)
live invariant tightening: re-verify the applied theme; recompile-or-drop under new constraints
```

**Logic (server, `withInvariance`).** `packages/server/src/runtime.ts`:

```
resolve subject + manifest + endpoint   (none → fail-open)
  → getActiveBundle: getPointer with cache:'no-store'; only status==='active' executes
  → verifyBundle: re-check sha256 + ed25519 + re-parse schema   (fail → null → fail-open)
                  (verified bundles cached by contentHash; sound, bundles are immutable)
  → per matching hook: fresh QuickJS-WASM runtime (mem cap, CPU-deadline interrupt, no host bindings, JSON-only)
  → checkCapabilityWrites (diffPaths vs declared writes; violation → emit event, discard THAT hook)
  → checkFieldConstraints (immutable-by-multiset: sort before/after, compare; any add/remove/rewrite → ORIGINAL payload)
  → current = execution.result    ← the apply line; effective for THIS request only
  → any exception anywhere → original payload
```

## 7. Cross-cutting concerns

- **Signing / trust** (§3). Verification happens once, in the control plane; the ed25519
  signature is the *portable proof* the deterministic gate approved this exact bundle, so an
  untrusted CDN can deliver trusted code. The runtime needs only the public key + a cheap
  crypto check, not a re-run of the verifier.
- **Shared path semantics.** `diffPaths`, `pathCovers`, `pathWithin`, `resolvePath`,
  `checkConstraint` live **once** in `packages/schema/src/paths.ts` and are imported by both
  the control-plane verifier (declared-path checks, via `pathWithin`) and the server runtime
  (actual-payload checks, via `diffPaths` + `pathCovers`). Defense-in-depth without code
  drift. (`diffPaths` itself only runs at runtime — it needs a real payload.)
- **Versioning / lazy migration.** Manifest publish marks live mods `stale`; stale subjects
  get base behavior until their next session re-authors/revalidates. No big-bang migration.
- **Kill-switch.** Pointer flips to `disabled`; latency bounded by pointer TTL (~5s), since
  bundles cache forever.
- **Sandboxing & budgets.** QuickJS-on-WASM (externalize the `quickjs-emscripten` chain in
  Next hosts). Per-hook cpu/mem budgets enforced by the runtime, capped by manifest policy at
  verify-time.
- **Observability & control surface.** Capability/field violations emit events
  (`hook_capability_violation`, …); analytics in the control plane. The **Console** is the
  single developer surface: manifest, mods + kill-switches, Guardrails (live test-enforcement),
  the Invariants view (data invariants read-only + look invariants editable via design-config),
  and Themes (version history + rollback).

## 8. Failure-mode matrix (everything resolves to "base app")

| Failure | Detected by | Result |
|---|---|---|
| Bundle bytes tampered on CDN | hash/signature mismatch in `verifyBundle` | `null` → original payload |
| Signing key rotated/lost | every verify fails | universal silent no-op → base app (⚠ §9) |
| Hook exceeds budget | sandbox interrupt | original payload |
| Hook writes undeclared field | `checkCapabilityWrites` | that hook's output discarded |
| Hook mutates immutable field | `checkFieldConstraints` (multiset) | whole-chain original payload |
| Theme violates locked token / contrast / chroma | `verifyV2` | recompile-or-drop → base CSS |
| Pointer stale/disabled/missing | registry status check | base behavior |
| No LLM configured | authoring guard | HTTP 503 (authoring only; runtime unaffected) |

## 9. Known gaps & sharp edges

1. **Signing-key durability.** Without persisted `INVARIANCE_SIGNING_*`, keys regenerate on
   control-plane restart → every existing bundle fails verification → universal silent no-op.
   Prod hand-off footgun.
2. **Auto-repair → verifier seam is untested.** `deriveRepairedWrites` widens `writes` via
   acorn; the verifier's immutable-field check is the only backstop. Each half is tested in
   isolation (`derive-writes.test.ts`, `verification.test.ts:180`), but **no test runs the
   inference *through* the verifier on an immutable field**. The strict-ancestor allowance
   makes this matter more: a write widened up to a container is *passed by design*, and the
   only protection is the runtime multiset check.
3. **Two live look-verifiers.** THEME/slot routes use `verifyV2` (`compiled-tests.ts`); the
   F2–F4 section route still calls the older `verify` engine (`engine.ts`, live at
   `agent/pipeline.ts:359`). No proof the two enforce identical invariants where they overlap.
4. **Onboarding's riskiest stages are its least specified.** Visual-QA convergence (Tailwind
   class repointing rarely renders pixel-identical — gradients, shadows, dark-mode variants,
   arbitrary values like `bg-[#1a1a1a]`) and intra-archetype section discovery (real React
   nests through wrapper components and layout files). What happens when visual-QA can't
   converge is undefined.
5. **Kill-switch latency.** Bounded by the ~5s pointer TTL — a disabled mod can keep executing
   until the cached pointer expires.
