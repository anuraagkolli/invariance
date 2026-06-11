# Designer Agent, Structured-Outputs Client, and THEME Pipeline — Phase 3 Design

Date: 2026-06-11
Status: approved design, pre-implementation
Covers: CLAUDE.md phase scope item 3, plus the v6 verification additions and the minimal v2 store/apply bridge needed to make the THEME path real end-to-end

## Context

Phase 1 built the Theme Compiler: `compileTheme(StyleSpec, constraints) → roles map`, proven over golden tests and a 2,592-spec sweep. Phase 3 builds the path that produces StyleSpecs: a Designer agent using the API's native structured outputs, a v6 Gatekeeper that routes THEME vs slot-level intents, a shared raw-fetch client, the v6 verification additions, and just enough v2 plumbing that "make it more retro" repaints the page at the end of this phase.

Success shape (DESIGN.md Part 4): user types a vibe → Gatekeeper classifies THEME → Designer emits a StyleSpec → Compiler expands it → verification recomputes the contrast matrix independently → theme.json v2 is stored → role tokens land on `:root`.

## Scope

In: `packages/core/src/agent/` (api client, models constants, designer + prompt template, gatekeeper v6 rewrite, pipeline routing), `verify/` v6 additions, config `design.constraints` parsing, v2-aware store/apply bridge, type widening (`AnyThemeJson`).

Out (later phases): SLOT_F1 micro-mutation path (phase 4 — SLOT_F1 falls back to the v5 Builder in this phase), Builder `theme.slots` fallback removal (4), render-driven F2/F3 + DOM-applier deletion (5), SSR + font loading (7), scanner role emission (6). The v5 Builder and its prompt are untouched except for routing.

**Known interim gap (dies in phase 4):** once the loader upgrades a stored theme to v2 — the normal state for every user after this phase — a SLOT_F1 Builder mutation is translated from `theme.globals` into v2 `theme.slots` (`translateMutationToV2` in pipeline.ts). The v5 F1 value checks (palette membership, hex validity, contrast) read `theme.globals` and therefore pass trivially on the translated candidate; slot literal values are unverified until the phase-4 micro-mutation path (which contrast-solves them) replaces the bridge. A slot literal keyed to a locked role token would also visually shadow the lock (slots write after roles). Accepted because the bridge is temporary and the inline-style fallback is rejected outright.

## Current-API facts this design relies on (verified 2026-06-11 via the claude-api skill)

- Structured outputs are GA: `output_config: { format: { type: 'json_schema', schema } }` on `POST /v1/messages`. No beta header. (DESIGN.md's "beta header the feature requires" is stale — the spec supersedes it.)
- The wire schema dialect REJECTS numeric bounds (`minimum`/`maximum`), `minLength`, and requires `additionalProperties: false` on every object. `enum` IS supported.
- Consequence: the Designer's wire schema is a **relaxed StyleSpec** — no hue bounds, no min-length — with two strengthenings the dialect does allow: `fontPairing` as an `enum` of registry ids, and all enums verbatim. Full validation happens on our side with the zod `StyleSpecSchema` after receipt; out-of-range values surface as `InvalidStyleSpecError` and feed the retry loop.
- Models: Gatekeeper `claude-haiku-4-5`, Designer `claude-sonnet-4-6`, Builder `claude-sonnet-4-6` (unchanged). All three accept `temperature` (Haiku 4.5 / Sonnet 4.6 — unlike Opus 4.7+). One constants module owns the IDs.
- `stop_reason: 'refusal'` and `max_tokens` truncation are handled as pipeline errors, not crashes.

## Module design

### agent/models.ts

```ts
export const GATEKEEPER_MODEL = 'claude-haiku-4-5'
export const DESIGNER_MODEL = 'claude-sonnet-4-6'
export const BUILDER_MODEL = 'claude-sonnet-4-6'
```

Builder.ts switches its hardcoded id to the constant (its only change this phase).

### agent/api.ts — shared raw-fetch client

```ts
export interface ClaudeCallOptions {
  apiKey: string
  model: string
  system: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  temperature: number
  maxTokens: number
  outputSchema?: Record<string, unknown>   // json_schema wire format
  fetchFn?: typeof fetch                   // injectable for keyless tests
}

export type ClaudeCallResult =
  | { ok: true; text: string }
  | { ok: false; error: string }           // connection / HTTP / refusal / truncation
```

One function `callClaude(opts)` owning: endpoint (`https://api.anthropic.com/v1/messages`), headers (`x-api-key`, `anthropic-version: 2023-06-01`, `anthropic-dangerous-direct-browser-access: true` — the panel runs in the browser, same as v5), `output_config.format` injection when `outputSchema` is present, refusal/truncation detection (`stop_reason`), and never-throw error mapping. Gatekeeper and Designer build on it; with structured outputs there is no markdown-fence stripping — `text` is the JSON document itself.

`fetchFn` defaults to the global `fetch`. Every agent test injects a stub; the suite stays keyless (CLAUDE.md hard rule).

### agent/gatekeeper.ts — v6 classification

New result type (replaces the v5 intent/clarification/error union):

```ts
export type GateKind = 'THEME' | 'SLOT_F1' | 'F2' | 'F3' | 'F4' | 'CLARIFY' | 'REJECT'

export type GatekeeperResult =
  | { kind: 'THEME'; description: string }
  | { kind: 'SLOT_F1' | 'F2' | 'F3' | 'F4'; slotName: string; level: number; description: string; requirements: string[] }
  | { kind: 'CLARIFY'; message: string }
  | { kind: 'REJECT'; message: string }
  | { kind: 'ERROR'; message: string }     // transport-level, never model-produced
```

Structured output wire schema: object with `kind` enum + the per-kind optional fields, `additionalProperties: false`; zod-validated after receipt with per-kind refinements. Model `claude-haiku-4-5`, temp 0.1, max_tokens 1024.

Prompt lives in `agent/gatekeeper-prompt.ts` (template function, not inline strings — CLAUDE.md convention). Content: the v5 slot-resolution rules (canonical names, aliases, prefer cssVariables, clarify on ambiguity) plus the v6 split — whole-app styling/vibe requests ("make it retro", "darker", "more professional") are THEME; single-target style requests ("make the sidebar blue") are SLOT_F1; content/layout/swap as before. Level gates: THEME requires at least one page with level ≥ 1 (else REJECT explaining what's locked); slot kinds validate against the slot's level as in v5.

### agent/designer.ts + agent/designer-prompt.ts

```ts
export interface DesignerInput {
  request: string                        // user's words, verbatim
  currentSpec?: StyleSpec                // provenance from the active theme, for "more X" relativity
  constraints: DesignConstraints
  apiKey: string
  fetchFn?: typeof fetch
}

export type DesignerResult =
  | { ok: true; spec: StyleSpec }
  | { ok: false; error: string; retryable: boolean }

export async function callDesigner(input, retryFeedback?: string[]): Promise<DesignerResult>
```

Model `claude-sonnet-4-6`, temp 0.7, max_tokens 2048, structured outputs with the relaxed StyleSpec wire schema (`fontPairing` enum = registry ids ∩ `constraints.font_registry` when restricted).

System prompt per the design-taste skill's "Designer system prompt rules", assembled by `designer-prompt.ts`:
- the canonical role vocabulary (imported from `ROLE_TOKENS`, not retyped)
- the developer constraint block (locked tokens, chroma cap, allowed modes, contrast floor)
- **exactly three packs as few-shot examples, selected by tag overlap with the user's request** — `selectFewShotPacks(request, THEME_PACKS, 3)`: pure, deterministic (score = tag hits in the lowercased request; ties broken by registry order), exported for testing
- taste principles 1, 2, and 6 verbatim from the skill
- the pack-shortcut rule: when the request names a pack style directly, start from that pack and change at most 3 fields
- when `currentSpec` exists it is included as "the current design" so relative requests move 2–3 fields, not all 12

Validation: parse JSON → zod `StyleSpecSchema` → on failure return `{ok: false, retryable: true}` with the zod issues; the pipeline feeds them back as `retryFeedback` (one retry for spec-invalid, shared with the verify retry budget below).

### agent/pipeline.ts — routing

```
runPipeline(userMessage, history, context, onProgress)
  → callGatekeeper
      THEME    → designer → compileTheme → verify(v2 candidate) → store + apply
      SLOT_F1  → v5 Builder path (TODO phase 4 micro-mutation), unchanged behavior
      F2/F3/F4 → v5 Builder path, unchanged
      CLARIFY/REJECT/ERROR → returned directly
```

THEME route detail:
1. `constraints = deriveConstraints(context.config)` (below)
2. `callDesigner({request, currentSpec, constraints, ...})` — `currentSpec` read from the stored v2 theme's `theme.styleSpec` when present
3. `compileTheme(spec, constraints)` — `InvalidStyleSpecError` → retry Designer with the issues; compile warnings ≠ failure (stored in result)
4. Build the v2 candidate: `upgradeThemeJson(currentTheme)` (no-op when already v2) then set `theme.roles = compiled.roles`, `theme.styleSpec = spec` — content/layout/components carry through; existing `theme.slots` literals (user's precision edits) are preserved on top of the new roles. Note: in v2, `version` is the SCHEMA version (literal 2), not a per-save revision counter as v5's pipeline treated it; revision tracking is the storage backend's concern and is out of scope here
5. `verifyV2(candidate, config, constraints)` (below) — failures → retry Designer with violation messages
6. Retry budget: **max 2 Designer retries total** (spec-invalid and verify-fail share it; DESIGN.md: "retry the producing stage, max 2")
7. Store via `storageBackend.saveTheme` + `themeStore.setTheme` + `applyAnyTheme` (below)

Progress stages gain `'designer' | 'compiling'`. LLM calls per THEME request: 2 (Gatekeeper + Designer), +1 per retry — matches DESIGN.md.

### Verification — v6 additions (`verify/compiled-tests.ts` + engine entry)

New deterministic tests, run against a v2 candidate whose roles were just compiled:

| Test | Checks |
|---|---|
| `styleSpecValid` | `theme.styleSpec` parses under `StyleSpecSchema` |
| `compilerOutputComplete` | every `ROLE_TOKENS` entry present and non-empty in `theme.roles` |
| `lockedTokensUntouched` | every `constraints.locked_tokens` entry appears byte-identical in roles |
| `contrastPairs` | independent `wcagContrast` recompute of the full Phase 1 pair matrix (the safety net — same pairs as `golden.test.ts`, sourced from one shared pair-list module so they cannot drift) |
| `fontInRegistry` | `--inv-font-display/body/mono` values correspond to a registry pairing (or the default mono stack) |
| `varRefsResolve` | every `var(--inv-X)` reference in `theme.slots` points at a key that exists in roles or slots |

Entry point: `verifyV2(themeV2, config, constraints) → VerificationResult` (same result shape as v5 `verify`). The v5 engine and its 84-test suite are untouched; `verifyV2` is a sibling, exported beside it. The pair list moves to `compiler/contrast-pairs.ts` and `golden.test.ts` imports it (one source of truth).

### Config — `design.constraints` (the v6 YAML block)

Extend `InvarianceConfig.frontend.design` (additive, v5 keys untouched):

```yaml
design:
  constraints:
    contrast: ">= 4.5"            # parsed to a number (floor)
    accent_chroma_max: 0.25
    locked_tokens: { --inv-accent: "#e94560" }
    allowed_modes: [light, dark]
    font_registry: default         # 'default' | list of pairing ids
```

Zod schema additions mirror the shape; `deriveConstraints(config): DesignConstraints` maps it to the compiler's interface (`">= 4.5"` → `4.5`; `font_registry: 'default'` → undefined = unrestricted; absent block → `{}`). Pure, colocated test.

### Store/apply bridge (minimal, phase-5 work NOT pulled forward)

- `export type AnyThemeJson = ThemeJson | ThemeJsonV2` in config/types; `isV2Theme(t): t is ThemeJsonV2` guard — shape-aware: `version >= 2 && !('globals' in theme)`, because v5's pipeline used `version` as a per-save revision counter, so the number alone misclassifies legacy data.
- `StorageBackend`, `ThemeStore`, provider state widen to `AnyThemeJson` (backends serialize JSON — no behavior change; memory/localStorage/api don't introspect).
- v1-only consumers (`slot.tsx` inline-style read, DOM appliers) gain a guard: v2 themes short-circuit those paths (v2 has no inline-style slots by construction — lookup misses are already no-ops; the guard makes it explicit).
- `runtime/apply.ts`: `applyAnyTheme(theme, config)` — v1 → existing `applyThemeJson` unchanged; v2 → write every `theme.roles` then `theme.slots` entry verbatim to `:root` (`var()` references are valid custom-property values natively — no resolution needed). F2/F3 application for v2 stays out (phase 5); content/layout in a v2 doc are stored but not applied, matching today's reality that the DOM appliers are being deleted next phase anyway.

### Loader wiring (closes the Phase 1 deferral)

The provider's initial-load path runs `upgradeThemeJson` on whatever the backend returns, so the in-memory shape is v2 from here on (warnings logged). This was the "deferred until the render-driven phase" item from the Phase 1 spec — the bridge makes it natural now; the spec note there is updated.

## Error handling

| Condition | Behavior |
|---|---|
| Transport/HTTP/refusal at Gatekeeper | `{kind: 'ERROR'}` → pipeline error result (v5 messages preserved) |
| Designer JSON fails zod | retry with issues (budget 2), then error result |
| `InvalidStyleSpecError` from compileTheme | same retry path (it carries `.issues` for the prompt) |
| verifyV2 failure | retry Designer with failed-test messages (same budget) |
| Compile warnings | not failures — attached to the success result for the panel |
| Truncation (`stop_reason: max_tokens`) | error result, no retry (raise maxTokens instead — a bug, not a model miss) |

## Testing (all keyless — stub `fetchFn` everywhere)

1. `api.test.ts` — header/body shape (snapshot the request body incl. `output_config`), error mapping (HTTP 400/500, refusal, truncation), schema injection.
2. `gatekeeper.test.ts` — canned structured responses → each kind; level gating (THEME rejected when all pages locked); malformed model output → ERROR not throw.
3. `designer.test.ts` — canned valid spec → ok; out-of-range hue (wire schema can't catch it) → retryable zod failure with issues; `selectFewShotPacks` determinism + tag-overlap ranking ("make it brutalist" must select the neobrutalist pack first); wire schema has NO minimum/maximum/minLength keys anywhere (regression test against the dialect) and fontPairing enum matches the registry.
4. `pipeline.test.ts` — THEME happy path end-to-end with stubbed fetch (Gatekeeper canned → Designer canned → real compileTheme → real verifyV2 → in-memory store): assert stored doc is valid v2 with 22 roles + styleSpec provenance and that existing slot literals survive; retry path (first Designer response invalid → second valid); budget exhaustion → error; SLOT_F1/F2 routes still reach the v5 Builder (stub).
5. `compiled-tests.test.ts` — each v6 verify test pass + fail fixtures; contrastPairs catches a hand-corrupted role map that the compiler would never emit.
6. `derive-constraints.test.ts` — YAML block → DesignConstraints mapping incl. `">= 7"` parsing and `font_registry` modes.
7. `apply.test.ts` (jsdom or documentElement stub) — v2 doc writes roles+slots to `:root` verbatim including `var()` values; v1 path untouched.
8. Existing 300 tests stay green; v5 gatekeeper tests don't exist (nothing to migrate — the v5 GatekeeperResult type is replaced and `index.ts` exports updated).

## Dependencies

None new. culori/zod already present; no SDK (raw fetch stays a core thesis).

## Open questions

None — scope and models settled with the user 2026-06-11.
