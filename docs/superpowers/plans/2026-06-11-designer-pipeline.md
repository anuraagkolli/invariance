# Designer Pipeline Implementation Plan (Phase 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Designer agent (StyleSpec via native structured outputs), v6 Gatekeeper routing, shared raw-fetch client, v6 verification additions, `design.constraints` config, and the v2 store/apply bridge — per `docs/superpowers/specs/2026-06-11-designer-pipeline-design.md` (READ IT FIRST — it is normative for every shape below).

**Architecture:** All LLM traffic flows through one `callClaude()` raw-fetch client with injectable `fetchFn` (keyless tests). Gatekeeper (haiku, temp 0.1) classifies into 7 kinds; THEME routes to Designer (sonnet, temp 0.7) → `compileTheme` → `verifyV2` → store v2 + apply to `:root`. Wire schemas are a relaxed dialect (NO `minimum`/`maximum`/`minLength`; `additionalProperties: false` everywhere; `enum` allowed) — zod revalidates on receipt.

**Tech Stack:** TypeScript strict, zod, vitest, raw fetch. Conventions: named exports, no semicolons, single quotes, kebab-case files, colocated tests, comments explain why. Repo root: /Users/anuraag/invariance. Branch: `designer-pipeline`. Baseline: 300 tests green (248 core + 52 scanner) — keep them green at every commit.

**Worker context notes:**
- READ the spec file first, then the existing file(s) each task modifies. v5 agent files (gatekeeper/builder/pipeline) have NO tests — you are adding the first ones.
- Existing modules you'll consume: `compiler/compile.ts` (compileTheme, InvalidStyleSpecError with `.issues`), `compiler/style-spec.ts` (StyleSpec, StyleSpecSchema, DesignConstraints), `compiler/roles.ts` (ROLE_TOKENS), `registries/{font-pairings,theme-packs}.ts` (FONT_PAIRINGS, THEME_PACKS with `tags`), `config/upgrade.ts` (upgradeThemeJson), `config/schema.ts` (ThemeJsonV2Schema, CSS_VAR_KEY), `verify/types.ts` (TestResult/VerificationResult shapes — read them).
- Commit per task; verify the commit landed (`git log --oneline -2`).

---

### Task 1: models.ts + api.ts (shared raw-fetch client)

**Files:**
- Create: `packages/core/src/agent/models.ts`, `packages/core/src/agent/api.ts`
- Modify: `packages/core/src/agent/builder.ts` (model constant only), `packages/core/src/agent/gatekeeper.ts` (model constant only — full rewrite comes in Task 3)
- Test: `packages/core/src/agent/api.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/agent/api.test.ts
import { describe, it, expect, vi } from 'vitest'
import { callClaude } from './api'

const okResponse = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response

const baseOpts = {
  apiKey: 'k', model: 'claude-haiku-4-5', system: 'sys',
  messages: [{ role: 'user' as const, content: 'hi' }],
  temperature: 0.1, maxTokens: 1024,
}

describe('callClaude', () => {
  it('sends the documented request shape', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse({
      content: [{ type: 'text', text: '{}' }], stop_reason: 'end_turn',
    }))
    await callClaude({ ...baseOpts, fetchFn })
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect(init.headers['x-api-key']).toBe('k')
    expect(init.headers['anthropic-version']).toBe('2023-06-01')
    const body = JSON.parse(init.body)
    expect(body.model).toBe('claude-haiku-4-5')
    expect(body.temperature).toBe(0.1)
    expect(body.max_tokens).toBe(1024)
    expect(body.output_config).toBeUndefined()
  })

  it('injects output_config.format when a schema is provided', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse({
      content: [{ type: 'text', text: '{}' }], stop_reason: 'end_turn',
    }))
    const schema = { type: 'object', additionalProperties: false, properties: {} }
    await callClaude({ ...baseOpts, outputSchema: schema, fetchFn })
    const body = JSON.parse(fetchFn.mock.calls[0][1].body)
    expect(body.output_config).toEqual({ format: { type: 'json_schema', schema } })
  })

  it('returns the text block on success', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse({
      content: [{ type: 'text', text: '{"a":1}' }], stop_reason: 'end_turn',
    }))
    expect(await callClaude({ ...baseOpts, fetchFn })).toEqual({ ok: true, text: '{"a":1}' })
  })

  it('maps missing key, connection, HTTP, refusal, truncation, and empty body to errors', async () => {
    expect((await callClaude({ ...baseOpts, apiKey: '' })).ok).toBe(false)
    const conn = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    expect((await callClaude({ ...baseOpts, fetchFn: conn })).ok).toBe(false)
    const http = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as unknown as Response)
    expect((await callClaude({ ...baseOpts, fetchFn: http })).ok).toBe(false)
    const refusal = vi.fn().mockResolvedValue(okResponse({ content: [], stop_reason: 'refusal' }))
    expect((await callClaude({ ...baseOpts, fetchFn: refusal })).ok).toBe(false)
    const trunc = vi.fn().mockResolvedValue(okResponse({ content: [{ type: 'text', text: '{' }], stop_reason: 'max_tokens' }))
    expect((await callClaude({ ...baseOpts, fetchFn: trunc })).ok).toBe(false)
    const empty = vi.fn().mockResolvedValue(okResponse({ content: [], stop_reason: 'end_turn' }))
    expect((await callClaude({ ...baseOpts, fetchFn: empty })).ok).toBe(false)
  })

  it('never throws', async () => {
    const bad = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => { throw new Error('bad json') } } as unknown as Response)
    await expect(callClaude({ ...baseOpts, fetchFn: bad })).resolves.toMatchObject({ ok: false })
  })
})
```

- [ ] **Step 2: Run, verify FAIL** — `pnpm --filter invariance test -- run src/agent/api.test.ts`

- [ ] **Step 3: Implement**

```ts
// packages/core/src/agent/models.ts
// One place owns the model ids (DESIGN.md 1.9): swap tiers here, nowhere else.
export const GATEKEEPER_MODEL = 'claude-haiku-4-5'
export const DESIGNER_MODEL = 'claude-sonnet-4-6'
export const BUILDER_MODEL = 'claude-sonnet-4-6'
```

```ts
// packages/core/src/agent/api.ts
export interface ClaudeCallOptions {
  apiKey: string
  model: string
  system: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  temperature: number
  maxTokens: number
  outputSchema?: Record<string, unknown>
  fetchFn?: typeof fetch
}

export type ClaudeCallResult = { ok: true; text: string } | { ok: false; error: string }

interface MessagesResponse {
  content?: Array<{ type: string; text?: string }>
  stop_reason?: string
}

// Raw fetch on purpose (no SDK — core thesis). Never throws: agents and the
// pipeline branch on { ok }, and a thrown transport error must not crash the panel.
export async function callClaude(opts: ClaudeCallOptions): Promise<ClaudeCallResult> {
  const fetchFn = opts.fetchFn ?? fetch
  if (!opts.apiKey) return { ok: false, error: 'Missing API key.' }

  let res: Response
  try {
    res = await fetchFn('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': opts.apiKey,
        'anthropic-version': '2023-06-01',
        // the customization panel calls from the browser, as in v5
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: opts.maxTokens,
        temperature: opts.temperature,
        system: opts.system,
        messages: opts.messages,
        ...(opts.outputSchema
          ? { output_config: { format: { type: 'json_schema', schema: opts.outputSchema } } }
          : {}),
      }),
    })
  } catch {
    return { ok: false, error: 'Connection error. Please try again.' }
  }

  if (!res.ok) return { ok: false, error: `API error (${res.status}). Please try again.` }

  let data: MessagesResponse
  try {
    data = (await res.json()) as MessagesResponse
  } catch {
    return { ok: false, error: 'Unreadable API response.' }
  }

  if (data.stop_reason === 'refusal') return { ok: false, error: 'The request was declined. Try rephrasing.' }
  if (data.stop_reason === 'max_tokens') return { ok: false, error: 'Response was truncated. Try a shorter request.' }

  const text = data.content?.find((b) => b.type === 'text')?.text
  if (!text) return { ok: false, error: 'Empty model response. Please try again.' }
  return { ok: true, text }
}
```

Then in `builder.ts` and `gatekeeper.ts`: replace the hardcoded `'claude-sonnet-4-6'` model strings with `BUILDER_MODEL` / `GATEKEEPER_MODEL` imports (gatekeeper now uses haiku — intended; its full rewrite is Task 3 and its behavior contract is replaced there anyway).

- [ ] **Step 4: PASS + full suite + build** (expect 306). **Step 5: Commit** — `git add -A packages/core && git commit -m "Add shared raw-fetch Claude client and model constants"`

---

### Task 2: design.constraints config + deriveConstraints

**Files:**
- Modify: `packages/core/src/config/types.ts`, `packages/core/src/config/schema.ts` (additive only — read first)
- Create: `packages/core/src/config/derive-constraints.ts`
- Test: `packages/core/src/config/derive-constraints.test.ts`

- [ ] **Step 1: Failing test**

```ts
// packages/core/src/config/derive-constraints.test.ts
import { describe, it, expect } from 'vitest'
import { deriveConstraints } from './derive-constraints'
import { InvarianceConfigSchema } from './schema'
import type { InvarianceConfig } from './types'

const cfg = (constraints: unknown): InvarianceConfig => ({
  app: 'x',
  frontend: { design: { constraints } },
}) as InvarianceConfig

describe('deriveConstraints', () => {
  it('maps the full v6 block', () => {
    const c = deriveConstraints(cfg({
      contrast: '>= 7',
      accent_chroma_max: 0.25,
      locked_tokens: { '--inv-accent': '#e94560' },
      allowed_modes: ['dark'],
      font_registry: ['geo-grotesk'],
    }))
    expect(c).toEqual({
      contrast: 7,
      accent_chroma_max: 0.25,
      locked_tokens: { '--inv-accent': '#e94560' },
      allowed_modes: ['dark'],
      font_registry: ['geo-grotesk'],
    })
  })

  it("treats font_registry 'default' as unrestricted", () => {
    expect(deriveConstraints(cfg({ font_registry: 'default' })).font_registry).toBeUndefined()
  })

  it('parses contrast strings with and without operator', () => {
    expect(deriveConstraints(cfg({ contrast: '>=4.5' })).contrast).toBe(4.5)
    expect(deriveConstraints(cfg({ contrast: '7' })).contrast).toBe(7)
    expect(deriveConstraints(cfg({ contrast: 'nonsense' })).contrast).toBeUndefined()
  })

  it('returns {} when the block is absent', () => {
    expect(deriveConstraints({ app: 'x' })).toEqual({})
  })

  it('schema accepts the v6 constraints block', () => {
    const parsed = InvarianceConfigSchema.safeParse({
      app: 'demo',
      frontend: { design: { constraints: {
        contrast: '>= 4.5', accent_chroma_max: 0.25,
        locked_tokens: { '--inv-accent': '#e94560' },
        allowed_modes: ['light', 'dark'], font_registry: 'default',
      } } },
    })
    expect(parsed.success).toBe(true)
  })

  it('schema still accepts v5 configs untouched', () => {
    expect(InvarianceConfigSchema.safeParse({ app: 'demo' }).success).toBe(true)
  })
})
```

- [ ] **Step 2: FAIL.** **Step 3: Implement.**

types.ts — add inside `frontend.design` (additive):

```ts
constraints?: {
  contrast?: string
  accent_chroma_max?: number
  locked_tokens?: Record<string, string>
  allowed_modes?: Array<'light' | 'dark'>
  font_registry?: 'default' | string[]
}
```

schema.ts — add `ConstraintsConfigSchema` (zod mirror: contrast `z.string()`, accent_chroma_max nonnegative number, locked_tokens record with the existing CSS_VAR_KEY key regex, allowed_modes array of the enum, font_registry union of literal 'default' and string array) and wire it into `DesignConfigSchema` as `constraints: ConstraintsConfigSchema.optional()`.

```ts
// packages/core/src/config/derive-constraints.ts
import type { InvarianceConfig } from './types'
import type { DesignConstraints } from '../compiler/style-spec'

// Maps the developer-facing YAML block to the compiler's interface.
// 'default' font_registry means "the whole shipped registry" = no restriction.
export function deriveConstraints(config: InvarianceConfig): DesignConstraints {
  const block = config.frontend?.design?.constraints
  if (!block) return {}
  const out: DesignConstraints = {}
  if (block.contrast) {
    const m = /([\d.]+)\s*$/.exec(block.contrast.trim())
    const n = m ? Number(m[1]) : NaN
    if (!Number.isNaN(n)) out.contrast = n
  }
  if (block.accent_chroma_max !== undefined) out.accent_chroma_max = block.accent_chroma_max
  if (block.locked_tokens) out.locked_tokens = block.locked_tokens
  if (block.allowed_modes) out.allowed_modes = block.allowed_modes
  if (Array.isArray(block.font_registry)) out.font_registry = block.font_registry
  return out
}
```

- [ ] **Step 4: PASS + full suite + build.** **Step 5: Commit** — `"Add design.constraints config block and deriveConstraints"`

---

### Task 3: Gatekeeper v6 (classification kinds + structured outputs + prompt template)

**Files:**
- Rewrite: `packages/core/src/agent/gatekeeper.ts` (READ the v5 file first — port its slot-resolution rules and error-message wording)
- Create: `packages/core/src/agent/gatekeeper-prompt.ts`, `packages/core/src/agent/wire-schemas.ts`
- Modify: `packages/core/src/agent/pipeline.ts` (compatibility shim only: map new kinds onto the existing flow — THEME → temporary error `'Whole-app theming lands in the next task.'`, SLOT_F1/F2/F3/F4 → the existing Builder path with `{slotName, level, description, requirements}`, CLARIFY → clarification, REJECT/ERROR → error), `packages/core/src/index.ts` (export updates: GatekeeperResult shape changed)
- Test: `packages/core/src/agent/gatekeeper.test.ts`

- [ ] **Step 1: Failing test** (canned structured responses through a stub fetch; helper to build a Response with a given JSON text block):

```ts
// packages/core/src/agent/gatekeeper.test.ts
import { describe, it, expect, vi } from 'vitest'
import { callGatekeeper } from './gatekeeper'
import { GATEKEEPER_WIRE_SCHEMA } from './wire-schemas'
import type { SlotRegistration } from '../context/registry'
import type { InvarianceConfig } from '../config/types'

const modelSays = (obj: unknown) => vi.fn().mockResolvedValue({
  ok: true, status: 200,
  json: async () => ({ content: [{ type: 'text', text: JSON.stringify(obj) }], stop_reason: 'end_turn' }),
} as unknown as Response)

const slot = (over: Partial<SlotRegistration> = {}): SlotRegistration => ({
  name: 'sidebar', level: 1, pageName: '/dashboard', preserve: false,
  alternativesCount: 0, type: 'slot', cssVariables: ['--inv-sidebar-bg'], ...over,
})

const unlockedConfig: InvarianceConfig = {
  app: 'demo',
  frontend: { pages: { '/dashboard': { level: 4 } } },
}
const lockedConfig: InvarianceConfig = {
  app: 'demo',
  frontend: { pages: { '/dashboard': { level: 0 } } },
}

const call = (fetchFn: typeof fetch, config = unlockedConfig) =>
  callGatekeeper('make it retro', [], { registry: [slot()], config, apiKey: 'k', fetchFn })

describe('callGatekeeper (v6)', () => {
  it('classifies THEME', async () => {
    const r = await call(modelSays({ kind: 'THEME', description: 'retro whole-app restyle' }))
    expect(r).toEqual({ kind: 'THEME', description: 'retro whole-app restyle' })
  })

  it('classifies SLOT_F1 with slot fields', async () => {
    const r = await call(modelSays({
      kind: 'SLOT_F1', slotName: 'sidebar', level: 1,
      description: 'make the sidebar blue', requirements: ['blue background'],
    }))
    expect(r.kind).toBe('SLOT_F1')
    if (r.kind === 'SLOT_F1') expect(r.slotName).toBe('sidebar')
  })

  it('REJECTs THEME when every page is locked (level gate is ours, not the model’s)', async () => {
    const r = await call(modelSays({ kind: 'THEME', description: 'retro' }), lockedConfig)
    expect(r.kind).toBe('REJECT')
  })

  it('passes CLARIFY and REJECT through', async () => {
    expect((await call(modelSays({ kind: 'CLARIFY', message: 'which area?' }))).kind).toBe('CLARIFY')
    expect((await call(modelSays({ kind: 'REJECT', message: 'locked' }))).kind).toBe('REJECT')
  })

  it('maps malformed model output to ERROR, never throws', async () => {
    expect((await call(modelSays({ kind: 'SLOT_F1' }))).kind).toBe('ERROR')   // missing fields
    expect((await call(modelSays('not even an object'))).kind).toBe('ERROR')
    const dead = vi.fn().mockRejectedValue(new Error('net')) as unknown as typeof fetch
    expect((await call(dead)).kind).toBe('ERROR')
  })

  it('wire schema obeys the structured-outputs dialect', () => {
    const s = JSON.stringify(GATEKEEPER_WIRE_SCHEMA)
    expect(s).not.toContain('"minimum"')
    expect(s).not.toContain('"maximum"')
    expect(s).not.toContain('"minLength"')
    expect(GATEKEEPER_WIRE_SCHEMA.additionalProperties).toBe(false)
  })
})
```

- [ ] **Step 2: FAIL.** **Step 3: Implement.**

`wire-schemas.ts` (both schemas live here; Designer's comes in Task 4):

```ts
// packages/core/src/agent/wire-schemas.ts
// Structured-outputs wire dialect: NO minimum/maximum/minLength, enum allowed,
// additionalProperties: false required on every object. Bounds that the dialect
// cannot express are enforced by zod after receipt.
export const GATEKEEPER_WIRE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['kind'],
  properties: {
    kind: { type: 'string', enum: ['THEME', 'SLOT_F1', 'F2', 'F3', 'F4', 'CLARIFY', 'REJECT'] },
    slotName: { type: 'string' },
    level: { type: 'integer' },
    description: { type: 'string' },
    requirements: { type: 'array', items: { type: 'string' } },
    message: { type: 'string' },
  },
} as const
```

`gatekeeper.ts` rewrite:
- `GatekeeperResult` union exactly as the spec (THEME / slot kinds / CLARIFY / REJECT / ERROR).
- `callGatekeeper(userMessage, history, opts: { registry, config, apiKey, componentLibrary?, fetchFn? })` — note the v5 signature had positional params; consolidate into an options object (the pipeline is the only caller).
- zod schema for the model's reply: `kind` enum; `superRefine` requiring `description` for THEME; `slotName`+`level`+`description` for slot kinds (default `requirements` to `[]`); `message` for CLARIFY/REJECT. Failure → `{kind: 'ERROR', message: 'Something went wrong. Try rephrasing your request.'}` (keep v5 wording).
- THEME level gate enforced in code after parsing: if no page in `config.frontend?.pages` has `level >= 1`, return REJECT with a message naming the constraint ("All pages are locked (level 0); whole-app theming requires at least one page unlocked to level 1+."). Deterministic — never trust the model for permissions.
- `callClaude` with GATEKEEPER_MODEL, temp 0.1, maxTokens 1024, `outputSchema: GATEKEEPER_WIRE_SCHEMA`.

`gatekeeper-prompt.ts`: `buildGatekeeperPrompt(registry, config, componentLibrary?): string`. Port the v5 system prompt content (read it: level definitions, slot resolution rules — canonical names from registry, aliases, prefer cssVariables, preserve rules) and add the v6 classification section:

```
CLASSIFICATION
- THEME: whole-app styling/mood/vibe requests not tied to one element: "make it retro",
  "darker", "more professional", "feels too corporate". These restyle everything at once.
- SLOT_F1: a style change for ONE named/resolvable area: "make the sidebar blue".
- F2: text/label/image content changes. F3: reorder/show/hide sections. F4: swap a
  component for an approved alternative.
- CLARIFY: the target is ambiguous (two slots match) or the request is unintelligible.
- REJECT: the request targets something locked or out of scope; say why in `message`.
Output ONLY the JSON object — the schema is enforced.
```

`pipeline.ts` shim: adapt to the new result kinds without changing the Builder flow; THEME → `{type: 'error', message: 'Whole-app theming lands in the next task.'}` placeholder (replaced in Task 7). Slot kinds map to the old `intent` object shape the Builder consumes (kind → level number already present). Update `index.ts` exports if GatekeeperResult was exported (check).

- [ ] **Step 4: PASS + full suite + build.** **Step 5: Commit** — `"Rewrite Gatekeeper: v6 classification kinds via structured outputs"`

---

### Task 4: Designer agent + prompt + few-shot selection

**Files:**
- Create: `packages/core/src/agent/designer.ts`, `packages/core/src/agent/designer-prompt.ts`
- Modify: `packages/core/src/agent/wire-schemas.ts` (add `styleSpecWireSchema`)
- Test: `packages/core/src/agent/designer.test.ts`

- [ ] **Step 1: Failing test**

```ts
// packages/core/src/agent/designer.test.ts
import { describe, it, expect, vi } from 'vitest'
import { callDesigner } from './designer'
import { selectFewShotPacks, buildDesignerPrompt } from './designer-prompt'
import { styleSpecWireSchema } from './wire-schemas'
import { THEME_PACKS } from '../registries/theme-packs'
import { FONT_PAIRINGS } from '../registries/font-pairings'

const validSpec = THEME_PACKS[0].spec

const modelSays = (obj: unknown) => vi.fn().mockResolvedValue({
  ok: true, status: 200,
  json: async () => ({ content: [{ type: 'text', text: JSON.stringify(obj) }], stop_reason: 'end_turn' }),
} as unknown as Response)

describe('callDesigner', () => {
  it('returns a zod-valid StyleSpec', async () => {
    const r = await callDesigner({ request: 'make it retro', constraints: {}, apiKey: 'k', fetchFn: modelSays(validSpec) })
    expect(r).toEqual({ ok: true, spec: validSpec })
  })

  it('rejects an out-of-range hue the wire schema cannot bound', async () => {
    const r = await callDesigner({
      request: 'x', constraints: {}, apiKey: 'k',
      fetchFn: modelSays({ ...validSpec, accentHue: 999 }),
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.retryable).toBe(true)
      expect(r.error).toContain('accentHue')
    }
  })

  it('maps transport failure to non-retryable error', async () => {
    const dead = vi.fn().mockRejectedValue(new Error('net')) as unknown as typeof fetch
    const r = await callDesigner({ request: 'x', constraints: {}, apiKey: 'k', fetchFn: dead })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.retryable).toBe(false)
  })
})

describe('styleSpecWireSchema', () => {
  it('obeys the dialect and pins fontPairing to the registry', () => {
    const s = styleSpecWireSchema(FONT_PAIRINGS.map((p) => p.id))
    const text = JSON.stringify(s)
    expect(text).not.toContain('"minimum"')
    expect(text).not.toContain('"maximum"')
    expect(text).not.toContain('"minLength"')
    expect(s.additionalProperties).toBe(false)
    expect((s.properties.fontPairing as { enum: string[] }).enum).toContain('retro-terminal')
  })
})

describe('selectFewShotPacks', () => {
  it('ranks by tag overlap: "make it brutalist" selects neobrutalist first', () => {
    const picks = selectFewShotPacks('make it brutalist and bold', THEME_PACKS, 3)
    expect(picks).toHaveLength(3)
    expect(picks[0].id).toBe('neobrutalist')
  })

  it('is deterministic with zero overlap (registry order)', () => {
    const a = selectFewShotPacks('zzz', THEME_PACKS, 3).map((p) => p.id)
    const b = selectFewShotPacks('zzz', THEME_PACKS, 3).map((p) => p.id)
    expect(a).toEqual(b)
    expect(a).toEqual(THEME_PACKS.slice(0, 3).map((p) => p.id))
  })
})

describe('buildDesignerPrompt', () => {
  it('contains the constraint block, role vocabulary, and exactly three packs', () => {
    const prompt = buildDesignerPrompt({
      constraints: { locked_tokens: { '--inv-accent': '#e94560' }, accent_chroma_max: 0.2 },
      fewShot: selectFewShotPacks('retro', THEME_PACKS, 3),
    })
    expect(prompt).toContain('--inv-accent')
    expect(prompt).toContain('--inv-surface-0')
    expect((prompt.match(/"rationale"/g) ?? []).length).toBe(3)
  })
})
```

- [ ] **Step 2: FAIL.** **Step 3: Implement.**

`wire-schemas.ts` addition:

```ts
export function styleSpecWireSchema(pairingIds: readonly string[]) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['mode', 'accentHue', 'accentChroma', 'neutralTint', 'neutralTintStrength',
      'contrast', 'fontPairing', 'radius', 'shadow', 'density', 'borderWeight', 'rationale'],
    properties: {
      mode: { type: 'string', enum: ['light', 'dark'] },
      accentHue: { type: 'number' },          // 0-360 enforced by zod after receipt
      accentChroma: { type: 'string', enum: ['muted', 'medium', 'vivid'] },
      secondaryHue: { type: 'number' },
      neutralTint: { type: 'number' },
      neutralTintStrength: { type: 'string', enum: ['none', 'subtle', 'strong'] },
      contrast: { type: 'string', enum: ['soft', 'standard', 'high'] },
      fontPairing: { type: 'string', enum: [...pairingIds] },
      radius: { type: 'string', enum: ['sharp', 'subtle', 'rounded', 'pill'] },
      shadow: { type: 'string', enum: ['flat', 'subtle', 'pronounced', 'hard-offset'] },
      density: { type: 'string', enum: ['compact', 'standard', 'comfortable'] },
      borderWeight: { type: 'string', enum: ['hairline', 'standard', 'heavy'] },
      rationale: { type: 'string' },
    },
  } as const
}
```

`designer-prompt.ts`:

```ts
import type { StyleSpec, DesignConstraints } from '../compiler/style-spec'
import { ROLE_TOKENS } from '../compiler/roles'
import type { ThemePack } from '../registries/theme-packs'

// Tag-overlap few-shot selection: deterministic (score desc, registry order ties).
export function selectFewShotPacks(
  request: string,
  packs: readonly ThemePack[],
  n: number,
): ThemePack[] {
  const words = request.toLowerCase()
  const scored = packs.map((pack, i) => ({
    pack, i,
    score: pack.tags.reduce((s, tag) => s + (words.includes(tag.toLowerCase()) ? 1 : 0), 0),
  }))
  scored.sort((a, b) => b.score - a.score || a.i - b.i)
  return scored.slice(0, n).map((s) => s.pack)
}

export interface DesignerPromptInput {
  constraints: DesignConstraints
  fewShot: ThemePack[]
  currentSpec?: StyleSpec
}

export function buildDesignerPrompt(input: DesignerPromptInput): string {
  // assemble: role + mission, role vocabulary (ROLE_TOKENS joined), the developer
  // constraint block (locked tokens / chroma cap / allowed modes / contrast floor,
  // each line only when present), taste principles 1, 2, 6 VERBATIM from the
  // design-taste skill, the pack-shortcut rule, the three few-shot packs as
  // labelled JSON examples (JSON.stringify(pack.spec, null, 2)), and -- when
  // currentSpec is present -- "CURRENT DESIGN" + its JSON with the instruction that
  // relative requests ("more X") move 2-3 fields from it, not all 12.
}
```

The verbatim taste principles (from `.claude/skills/design-taste/SKILL.md` — copy them exactly):
1. "Commit to one coherent direction per theme. A spec should be describable in five words. If it needs \"and\", cut something."
2. "Spend boldness in one place. One loud decision (the accent, the display face, the shadow language), everything else disciplined. Two loud decisions compete; three is noise."
6. "The default answer to \"more X\" is to move 2-3 StyleSpec fields, not all 12. Restraint reads as intent."

Plus the pack-shortcut rule: "When the user's request names a pack era or style directly (\"brutalist\"), start from that pack's spec and change at most 3 fields."

`designer.ts`:

```ts
import { StyleSpecSchema } from '../compiler/style-spec'
import type { StyleSpec, DesignConstraints } from '../compiler/style-spec'
import { FONT_PAIRINGS } from '../registries/font-pairings'
import { THEME_PACKS } from '../registries/theme-packs'
import { callClaude } from './api'
import { DESIGNER_MODEL } from './models'
import { styleSpecWireSchema } from './wire-schemas'
import { buildDesignerPrompt, selectFewShotPacks } from './designer-prompt'

export interface DesignerInput {
  request: string
  currentSpec?: StyleSpec
  constraints: DesignConstraints
  apiKey: string
  fetchFn?: typeof fetch
}

export type DesignerResult =
  | { ok: true; spec: StyleSpec }
  | { ok: false; error: string; retryable: boolean }

export async function callDesigner(input: DesignerInput, retryFeedback?: string[]): Promise<DesignerResult> {
  const pairingIds = input.constraints.font_registry ?? FONT_PAIRINGS.map((p) => p.id)
  const system = buildDesignerPrompt({
    constraints: input.constraints,
    fewShot: selectFewShotPacks(input.request, THEME_PACKS, 3),
    ...(input.currentSpec ? { currentSpec: input.currentSpec } : {}),
  })
  const userContent = retryFeedback?.length
    ? `${input.request}\n\nYOUR PREVIOUS SPEC WAS REJECTED:\n${retryFeedback.map((f) => `- ${f}`).join('\n')}\nProduce a corrected StyleSpec.`
    : input.request

  const result = await callClaude({
    apiKey: input.apiKey, model: DESIGNER_MODEL, system,
    messages: [{ role: 'user', content: userContent }],
    temperature: 0.7, maxTokens: 2048,
    outputSchema: styleSpecWireSchema(pairingIds),
    ...(input.fetchFn ? { fetchFn: input.fetchFn } : {}),
  })
  if (!result.ok) return { ok: false, error: result.error, retryable: false }

  let raw: unknown
  try { raw = JSON.parse(result.text) } catch {
    return { ok: false, error: 'Designer returned unparseable JSON.', retryable: true }
  }
  const parsed = StyleSpecSchema.safeParse(raw)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
    return { ok: false, error: issues.join('; '), retryable: true }
  }
  return { ok: true, spec: parsed.data }
}
```

- [ ] **Step 4: PASS + full suite + build.** **Step 5: Commit** — `"Add Designer agent with structured outputs and tag-ranked few-shot packs"`

---

### Task 5: v6 verification additions + shared contrast-pair list

**Files:**
- Create: `packages/core/src/compiler/contrast-pairs.ts`, `packages/core/src/verify/compiled-tests.ts`
- Modify: `packages/core/src/compiler/golden.test.ts` (import the shared pair list instead of its inline copy — assertions identical, snapshots untouched)
- Test: `packages/core/src/verify/compiled-tests.test.ts`

- [ ] **Step 1:** Extract the pair matrix from `golden.test.ts` into:

```ts
// packages/core/src/compiler/contrast-pairs.ts
// Single source of truth for the verified pair matrix: golden tests, the verify
// engine, and (later) CI tooling must not drift from each other.
export function contrastPairs(primaryTarget: number): Array<[string, string, number]> {
  return [
    ['--inv-text-primary', '--inv-surface-0', primaryTarget],
    ['--inv-text-primary', '--inv-surface-1', primaryTarget],
    ['--inv-text-primary', '--inv-surface-2', primaryTarget],
    ['--inv-text-secondary', '--inv-surface-0', 4.5],
    ['--inv-text-secondary', '--inv-surface-1', 4.5],
    ['--inv-text-primary', '--inv-accent-subtle', 4.5],
    ['--inv-accent-contrast', '--inv-accent', 4.5],
    ['--inv-accent-contrast', '--inv-accent-hover', 4.5],
    ['--inv-text-disabled', '--inv-surface-1', 3.0],
    ['--inv-ring', '--inv-surface-0', 3.0],
    ['--inv-ring', '--inv-surface-1', 3.0],
    ['--inv-accent', '--inv-surface-0', 3.0],
  ]
}
```

Refactor golden.test.ts to consume it (run the golden file: snapshots must NOT change).

- [ ] **Step 2: Failing test for compiled-tests** — fixtures: a freshly compiled corporate-trust pack (real `compileTheme`) as the passing case; hand-corrupted variants for failures:

```ts
// packages/core/src/verify/compiled-tests.test.ts
import { describe, it, expect } from 'vitest'
import { compileTheme } from '../compiler/compile'
import { THEME_PACKS } from '../registries/theme-packs'
import { verifyV2 } from './compiled-tests'
import type { ThemeJsonV2 } from '../config/types'

const pack = THEME_PACKS.find((p) => p.id === 'corporate-trust')!
const compiled = compileTheme(pack.spec)
const goodTheme: ThemeJsonV2 = {
  version: 2, base_app_version: 'v1',
  theme: { roles: compiled.roles, slots: { '--inv-sidebar-bg': 'var(--inv-surface-1)' }, styleSpec: pack.spec },
}
const config = { app: 'demo' }

describe('verifyV2', () => {
  it('passes a freshly compiled theme', () => {
    const r = verifyV2(goodTheme, config, {})
    expect(r.passed, JSON.stringify(r.results.filter((t) => !t.passed))).toBe(true)
  })

  it('styleSpecValid fails on a corrupted spec', () => {
    const bad = { ...goodTheme, theme: { ...goodTheme.theme, styleSpec: { mode: 'neon' } as never } }
    const r = verifyV2(bad, config, {})
    expect(r.results.find((t) => t.name === 'styleSpecValid')?.passed).toBe(false)
  })

  it('compilerOutputComplete fails when a role is missing', () => {
    const roles = { ...compiled.roles }
    delete roles['--inv-ring']
    const r = verifyV2({ ...goodTheme, theme: { ...goodTheme.theme, roles } }, config, {})
    expect(r.results.find((t) => t.name === 'compilerOutputComplete')?.passed).toBe(false)
  })

  it('lockedTokensUntouched fails when a locked token was changed', () => {
    const r = verifyV2(goodTheme, config, { locked_tokens: { '--inv-accent': '#123456' } })
    expect(r.results.find((t) => t.name === 'lockedTokensUntouched')?.passed).toBe(false)
  })

  it('contrastPairs catches a hand-corrupted role map', () => {
    const roles = { ...compiled.roles, '--inv-text-primary': compiled.roles['--inv-surface-1'] }
    const r = verifyV2({ ...goodTheme, theme: { ...goodTheme.theme, roles } }, config, {})
    expect(r.results.find((t) => t.name === 'contrastPairs')?.passed).toBe(false)
  })

  it('fontInRegistry fails on a family outside the registry', () => {
    const roles = { ...compiled.roles, '--inv-font-display': "'Comic Sans MS', cursive" }
    const r = verifyV2({ ...goodTheme, theme: { ...goodTheme.theme, roles } }, config, {})
    expect(r.results.find((t) => t.name === 'fontInRegistry')?.passed).toBe(false)
  })

  it('varRefsResolve fails on a dangling var() reference', () => {
    const slots = { '--inv-header-bg': 'var(--inv-does-not-exist)' }
    const r = verifyV2({ ...goodTheme, theme: { ...goodTheme.theme, slots } }, config, {})
    expect(r.results.find((t) => t.name === 'varRefsResolve')?.passed).toBe(false)
  })
})
```

- [ ] **Step 3: Implement** `verify/compiled-tests.ts` — read `verify/types.ts` first and reuse the exact `TestResult`/`VerificationResult` shapes and the engine's pass criteria (warnings don't fail). Implementation notes:
  - `styleSpecValid`: absent styleSpec = pass with note (precision-edit-only themes have none); present → StyleSpecSchema.safeParse.
  - `compilerOutputComplete`: skip when `theme.roles` is empty/absent (theme not compiler-produced); else every ROLE_TOKENS key non-empty.
  - `contrastPairs`: derive primary target from `Math.max(CONTRAST_TARGETS[spec.contrast] ?? 4.5, constraints.contrast ?? 0)`; recompute with `wcagContrast` over `contrastPairs(target)`; skip pairs whose tokens are absent (consistent with the script's SKIP) but fail on any present pair below target; skip when roles empty.
  - `fontInRegistry`: each of the three font tokens equals some pairing's display/body/mono or DEFAULT_MONO_STACK.
  - `varRefsResolve`: regex `var\((--inv-[a-z0-9-]+)\)` over slot values; referenced name must exist in roles or slots.
  - `verifyV2(theme, config, constraints)` runs all six and aggregates like the v5 engine.

- [ ] **Step 4: PASS, golden snapshots unchanged, full suite + build.** **Step 5: Commit** — `"Add v6 compiled-theme verification with shared contrast-pair list"`

---

### Task 6: AnyThemeJson widening + v2 apply bridge + loader upgrade

**Files:**
- Modify: `packages/core/src/config/types.ts` (add `AnyThemeJson`, `isV2Theme`), `packages/core/src/storage/types.ts` + the three backends, `packages/core/src/context/theme-store.ts`, `packages/core/src/context/provider.tsx` (loader runs upgradeThemeJson; READ these files first), `packages/core/src/runtime/apply.ts` (add `applyAnyTheme`), `packages/core/src/primitives/slot.tsx` (guard: v2 themes skip the inline-style read)
- Test: `packages/core/src/runtime/apply-v2.test.ts`, plus extend an existing storage test if one exists (check; if none, the apply test carries the weight)

- [ ] **Step 1: Failing test**

```ts
// packages/core/src/runtime/apply-v2.test.ts
// @vitest-environment jsdom        ← only if jsdom is already a dep; otherwise stub:
import { describe, it, expect, beforeEach } from 'vitest'
import { applyAnyTheme } from './apply'
import { isV2Theme } from '../config/types'
import type { ThemeJsonV2, ThemeJson } from '../config/types'

// minimal documentElement stub — avoids a jsdom dependency
const setProps: Record<string, string> = {}
beforeEach(() => {
  for (const k of Object.keys(setProps)) delete setProps[k]
  ;(globalThis as { document?: unknown }).document = {
    documentElement: { style: { setProperty: (k: string, v: string) => { setProps[k] = v } } },
  }
})

const v2: ThemeJsonV2 = {
  version: 2, base_app_version: 'v1',
  theme: {
    roles: { '--inv-surface-0': '#0f1117', '--inv-font-display': "'VT323', monospace" },
    slots: { '--inv-sidebar-bg': 'var(--inv-surface-1)', '--inv-header-bg': '#123456' },
  },
}

describe('applyAnyTheme (v2)', () => {
  it('writes roles then slots verbatim to :root, var() refs included', () => {
    applyAnyTheme(v2 as never, { app: 'x' })
    expect(setProps['--inv-surface-0']).toBe('#0f1117')
    expect(setProps['--inv-sidebar-bg']).toBe('var(--inv-surface-1)')
    expect(setProps['--inv-header-bg']).toBe('#123456')
  })

  it('isV2Theme discriminates', () => {
    expect(isV2Theme(v2 as never)).toBe(true)
    const v1: ThemeJson = { version: 1, base_app_version: 'v1' }
    expect(isV2Theme(v1)).toBe(false)
  })
})
```

- [ ] **Step 2: FAIL.** **Step 3: Implement** — key decisions already made; the mechanical work:
  - types.ts: `export type AnyThemeJson = ThemeJson | ThemeJsonV2` and `export function isV2Theme(t: ThemeJson | ThemeJsonV2): t is ThemeJsonV2 { return t.version >= 2 }` (types.ts currently has no runtime exports — that's fine, it may; if the repo separates types from runtime, put `isV2Theme` in a new `config/theme-version.ts` instead and note it).
  - storage/types.ts + memory/local-storage/api backends: `ThemeJson` → `AnyThemeJson` in signatures (backends serialize blindly — verify by reading).
  - theme-store.ts + provider.tsx: state type widens; the provider's load path wraps the backend result in `upgradeThemeJson(...)` (log warnings via console.warn) so in-memory is always v2 going forward; initialTheme prop handling likewise.
  - apply.ts: `applyAnyTheme(theme: AnyThemeJson, config)` — `isV2Theme` → iterate `theme.theme?.roles` then `theme.theme?.slots`, `document.documentElement.style.setProperty(key, value)` guarded by `typeof document !== 'undefined'`; else delegate to the existing `applyThemeJson`. Existing callers of `applyThemeJson` inside the package switch to `applyAnyTheme`.
  - slot.tsx: the F1 inline-style read (`themeJson?.theme?.slots?.[name]`) gets an `isV2Theme` guard returning `{}` — v2 slots are CSS-var maps, not per-slot style objects; the lookup would be a silent no-op anyway, the guard makes the type honest.
  - CAUTION: provider/theme-store/slot changes ripple — run the full suite frequently; the 84 v5 core tests must stay green unmodified (they construct v1 themes, which the widened types still accept).

- [ ] **Step 4: PASS + full suite + build.** **Step 5: Commit** — `"Widen theme types to AnyThemeJson; v2 apply bridge and loader upgrade"`

---

### Task 7: Pipeline THEME route (end-to-end)

**Files:**
- Modify: `packages/core/src/agent/pipeline.ts` (replace the Task 3 placeholder with the real route)
- Test: `packages/core/src/agent/pipeline.test.ts`

- [ ] **Step 1: Failing test** — the heart of the phase: stubbed fetch for both agents, REAL compileTheme/verifyV2/upgrade, in-memory store:

```ts
// packages/core/src/agent/pipeline.test.ts
import { describe, it, expect, vi } from 'vitest'
import { runPipeline } from './pipeline'
import { THEME_PACKS } from '../registries/theme-packs'
import { ThemeJsonV2Schema } from '../config/schema'
import { createMemoryBackend } from '../storage/memory'        // read storage/memory.ts for the actual export name
import { createThemeStore } from '../context/theme-store'      // read theme-store.ts for the actual export name
import type { AnyThemeJson } from '../config/types'

const spec = THEME_PACKS.find((p) => p.id === 'retro-arcade')!.spec

// fetch stub that answers the Gatekeeper call first, then Designer calls in order
const scriptedFetch = (replies: unknown[]) => {
  let i = 0
  return vi.fn().mockImplementation(async () => ({
    ok: true, status: 200,
    json: async () => ({
      content: [{ type: 'text', text: JSON.stringify(replies[Math.min(i++, replies.length - 1)]) }],
      stop_reason: 'end_turn',
    }),
  })) as unknown as typeof fetch
}

const context = (fetchFn: typeof fetch) => ({
  registry: [], config: { app: 'demo', frontend: { pages: { '/': { level: 4 } } } },
  themeStore: createThemeStore(), storageBackend: createMemoryBackend(),
  apiKey: 'k', userId: 'u', appId: 'a', fetchFn,
})

describe('runPipeline THEME route', () => {
  it('classifies, designs, compiles, verifies, stores v2, applies', async () => {
    const fetchFn = scriptedFetch([
      { kind: 'THEME', description: 'retro restyle' },
      spec,
    ])
    const ctx = context(fetchFn)
    const result = await runPipeline('make it retro', [], ctx)
    expect(result.type).toBe('success')
    const stored = await ctx.storageBackend.loadTheme('u', 'a') as AnyThemeJson
    const parsed = ThemeJsonV2Schema.safeParse(stored)
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(Object.keys(parsed.data.theme?.roles ?? {})).toHaveLength(22)
      expect(parsed.data.theme?.styleSpec?.fontPairing).toBe('retro-terminal')
    }
  })

  it('retries the Designer on an invalid spec, succeeds on the second', async () => {
    const fetchFn = scriptedFetch([
      { kind: 'THEME', description: 'retro' },
      { ...spec, accentHue: 999 },     // zod rejects post-receipt
      spec,
    ])
    const result = await runPipeline('make it retro', [], context(fetchFn))
    expect(result.type).toBe('success')
    expect(fetchFn).toHaveBeenCalledTimes(3)  // gatekeeper + designer x2
  })

  it('errors after the retry budget (2) is exhausted', async () => {
    const fetchFn = scriptedFetch([
      { kind: 'THEME', description: 'retro' },
      { ...spec, accentHue: 999 },
      { ...spec, accentHue: 999 },
      { ...spec, accentHue: 999 },
    ])
    const result = await runPipeline('make it retro', [], context(fetchFn))
    expect(result.type).toBe('error')
    expect(fetchFn).toHaveBeenCalledTimes(4)  // gatekeeper + designer x3 (initial + 2 retries)
  })

  it('preserves existing slot literals across a re-theme', async () => {
    const fetchFn = scriptedFetch([{ kind: 'THEME', description: 'retro' }, spec])
    const ctx = context(fetchFn)
    await ctx.storageBackend.saveTheme('u', 'a', {
      version: 2, base_app_version: 'v1',
      theme: { roles: {}, slots: { '--inv-header-bg': '#abcdef' } },
    } as AnyThemeJson)
    await runPipeline('make it retro', [], ctx)
    const stored = await ctx.storageBackend.loadTheme('u', 'a') as { theme?: { slots?: Record<string, string> } }
    expect(stored.theme?.slots?.['--inv-header-bg']).toBe('#abcdef')
  })

  it('routes CLARIFY straight through and slot kinds to the Builder path', async () => {
    const clarify = scriptedFetch([{ kind: 'CLARIFY', message: 'which area?' }])
    expect((await runPipeline('hm', [], context(clarify))).type).toBe('clarification')
    // SLOT_F1 reaches the Builder: builder responds with a mutation
    const slotFlow = scriptedFetch([
      { kind: 'SLOT_F1', slotName: 'sidebar', level: 1, description: 'blue sidebar', requirements: [] },
      { mutation: { theme: { globals: { '--inv-sidebar-bg': '#0000ff' } } }, explanation: 'done' },
    ])
    const r = await runPipeline('make the sidebar blue', [], context(slotFlow))
    expect(['success', 'error']).toContain(r.type)  // success if verify passes on empty config
  })
})
```

(Adapt store/backend constructor names after reading the actual files — the plan's names are guesses; everything else is normative.)

- [ ] **Step 2: FAIL.** **Step 3: Implement** the THEME branch per spec §pipeline: deriveConstraints → load current theme → upgrade → currentSpec from `theme.styleSpec` → Designer loop (`retryable` failures and `InvalidStyleSpecError.issues` and verifyV2 failure messages all feed `retryFeedback`; budget = 2 retries after the first attempt) → candidate assembly (compiled roles + spec, slots/content/layout/components carried) → ThemeJsonV2Schema.safeParse as a final invariant (throw on failure — compiler bug) → save + setTheme + applyAnyTheme → `{type: 'success', description: spec.rationale, slotName: 'theme'}` (keep PipelineResult shape; the panel shows description). Thread `fetchFn` from context into both agents. onProgress stages: `'gatekeeper' | 'designer' | 'compiling' | 'verifying' | 'retry' | 'applying'`.

- [ ] **Step 4: PASS + full suite + build.** **Step 5: Commit** — `"Wire THEME route: Designer to compiler to verify to v2 store/apply"`

---

### Task 8: Exports + final verification

**Files:** Modify `packages/core/src/index.ts`

- [ ] **Step 1:** Export the new public surface (match existing grouping): `callClaude` types, `GATEKEEPER_MODEL/DESIGNER_MODEL/BUILDER_MODEL`, `GatekeeperResult`/`GateKind`, `callDesigner`/`DesignerResult`/`DesignerInput`, `selectFewShotPacks`, `deriveConstraints`, `verifyV2`, `contrastPairs`, `AnyThemeJson`/`isV2Theme`, `applyAnyTheme`. Remove stale v5 gatekeeper type exports if they changed names.
- [ ] **Step 2:** `pnpm build && pnpm test` — both packages green; report exact counts (expect ≥ 330 core + 52 scanner).
- [ ] **Step 3:** Dist smoke:
```bash
node -e "const inv=require('./packages/core/dist/index.js');console.log(typeof inv.callDesigner, typeof inv.verifyV2, inv.GATEKEEPER_MODEL)"
```
Expected: `function function claude-haiku-4-5`.
- [ ] **Step 4:** Suite twice in a row — byte-stable (no snapshot churn).
- [ ] **Step 5: Commit** — `"Export Designer pipeline surface from the package root"`

---

## Verification (end-to-end)

1. Clean `pnpm build && pnpm test` — all green, keyless.
2. The pipeline test's happy path IS the phase's success criterion in miniature: canned vibe → real compile → real verify → valid v2 doc with 22 roles + provenance.
3. Spot-check: run the pipeline test file alone and confirm zero network access (stub-only — grep test output for no fetch errors).

## Out of scope (do not touch)

Builder prompt/behavior (beyond the model constant), DOM appliers, panel components, scanner package, SSR, slot-edit micro-mutations.
