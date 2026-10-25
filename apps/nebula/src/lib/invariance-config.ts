import type { InvarianceConfig } from '@invariance/design'
import { kitVariantAxes } from '@invariance/kit/variants'

// The home carousels, by slot name (mirrors home-screen.tsx ROWS). Used to build
// pack layout presets that swap every row to the wide grid.
const HOME_ROWS = ['row-trending', 'row-continue', 'row-originals', 'row-new', 'row-acclaimed']

// Nebula's own variant axis: the hero anatomy (hero.tsx ships each one).
export const HERO_LOOKS = ['billboard', 'split', 'centered', 'marquee'] as const
export type HeroLook = (typeof HERO_LOOKS)[number]

type RowComponent = 'CarouselRow' | 'GridRow' | 'ListRow' | 'SpotlightRow'
type Preset = NonNullable<NonNullable<InvarianceConfig['frontend']>['layout_profiles']>[string]

// Every home row gets an explicit renderer so switching profiles never leaves
// a previous profile's swap behind (presets merge per slot over the current theme).
function homeRows(base: RowComponent, overrides: Partial<Record<string, RowComponent>> = {}): Preset['components'] {
  return {
    pages: { '/': Object.fromEntries(HOME_ROWS.map((s) => [s, { component: overrides[s] ?? base }])) },
  }
}

// A whole-page look per theme profile (themeProfile in @invariance/design maps
// a StyleSpec to one). Each picks row renderers (F4) and component variants
// (hero/card/button/section-header/motion) — all developer-shipped recipes.
const PROFILES: Record<string, Preset> = {
  standard: {
    components: homeRows('CarouselRow'),
    variants: { hero: 'billboard', card: 'poster', button: 'solid', 'section-header': 'plain', motion: 'subtle' },
  },
  brutal: {
    components: homeRows('GridRow'),
    variants: { hero: 'marquee', card: 'framed', button: 'brutal', 'section-header': 'numbered', motion: 'snappy' },
  },
  terminal: {
    components: homeRows('ListRow', { 'row-originals': 'GridRow' }),
    variants: { hero: 'split', card: 'caption', button: 'outline', 'section-header': 'label', motion: 'none' },
  },
  editorial: {
    components: homeRows('CarouselRow', { 'row-trending': 'SpotlightRow', 'row-acclaimed': 'SpotlightRow' }),
    variants: { hero: 'centered', card: 'caption', button: 'ghost', 'section-header': 'rule', motion: 'subtle' },
  },
  glass: {
    components: homeRows('CarouselRow', { 'row-acclaimed': 'SpotlightRow' }),
    variants: { hero: 'billboard', card: 'glass', button: 'glow', 'section-header': 'plain', motion: 'springy' },
  },
  cinematic: {
    components: homeRows('CarouselRow', { 'row-trending': 'SpotlightRow' }),
    variants: { hero: 'centered', card: 'tilt', button: 'pill', 'section-header': 'outline', motion: 'springy' },
  },
  soft: {
    components: homeRows('GridRow', { 'row-originals': 'CarouselRow' }),
    variants: { hero: 'split', card: 'polaroid', button: 'pill', 'section-header': 'label', motion: 'playful' },
  },
}

// Relational constraints only — no palette mode. The compiler guarantees AA at
// every level, so the config just floors contrast and caps accent chroma.
// Exported for use by Providers and the gauntlet page.
export const invarianceConfig: InvarianceConfig = {
  app: 'nebula-demo',
  frontend: {
    design: {
      constraints: {
        contrast: '>= 4.5',
        accent_chroma_max: 0.18,
        font_registry: 'default',
        allowed_modes: ['light', 'dark'],
      },
    },
    // /my-list is locked: app-wide looks reach it, page-scoped picks can't.
    pages: { '/': { level: 4 }, '/series': { level: 4 }, '/movies': { level: 4 }, '/my-list': { level: 0 } },
    // Look-invariant over component anatomy: the variants a theme may pick.
    variants: {
      ...kitVariantAxes(),
      hero: { options: [...HERO_LOOKS], default: 'billboard' },
    },
    // A theme restyles AND restructures: its StyleSpec resolves to a profile
    // (brutal, terminal, editorial, glass, cinematic, soft, standard) whose
    // preset swaps row renderers and picks hero/card/button/header/motion
    // variants. `grid` stays as the legacy fallback for blocky specs.
    layout_profiles: {
      ...PROFILES,
      grid: { components: homeRows('GridRow') },
    },
  },
}

// ---------------------------------------------------------------------------
// Durable theme storage lives in the control plane (registry). Client-side, so
// it needs a NEXT_PUBLIC_* var; dev defaults to the local control plane on :4400.
// appId is the registry appId ("nebula"), not invarianceConfig.app.
export function themeStorageUrl(): string {
  // Tolerate a trailing slash on the env (a common copy-paste from a dashboard)
  // so we never emit a double-slashed `//v1` path.
  const registry = (process.env.NEXT_PUBLIC_INVARIANCE_REGISTRY ?? 'http://localhost:4400').replace(/\/$/, '')
  return `${registry}/v1/apps/nebula/themes`
}

// ---------------------------------------------------------------------------
// LLM provider selection (env-driven; default = open-source qwen via Ollama,
// routed through the /api/llm server proxy)
// ---------------------------------------------------------------------------
//
// Three modes, all swappable by env alone:
//   (default)                                  open-source model through /api/llm;
//                                              the server forwards to Ollama
//                                              (LLM_BASE_URL) and pins LLM_MODEL.
//   NEXT_PUBLIC_LLM_PROVIDER=anthropic         Claude through /api/llm; needs
//                                              server-side ANTHROPIC_API_KEY.
//   NEXT_PUBLIC_LLM_PROVIDER=openai-compatible browser-direct to an OpenAI-shaped
//                                              server (legacy local mode; needs
//                                              OLLAMA_ORIGINS=* for CORS).

type LlmStructuredMode = 'json_schema' | 'json_object'

export interface LlmProviderProps {
  apiKey: string
  apiBaseUrl?: string
  llmProvider?: 'openai-compatible'
  oaiStructuredMode?: LlmStructuredMode
  models?: { gatekeeper: string; designer: string; builder: string; slotEdit: string }
}

// Built from NEXT_PUBLIC_* env. 'proxy' is a non-empty apiKey sentinel — the
// panel's prompt input and the client's empty-key check both gate on a truthy
// key; the proxy routes never read the header.
export function llmProviderProps(): LlmProviderProps {
  const provider = process.env.NEXT_PUBLIC_LLM_PROVIDER
  const anthropicKey = process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY ?? ''

  if (provider === 'anthropic') {
    return { apiKey: 'proxy', apiBaseUrl: '/api/llm' }
  }

  if (provider === 'openai-compatible') {
    const baseUrl = process.env.NEXT_PUBLIC_LLM_BASE_URL ?? 'http://localhost:11434/v1'
    const model = process.env.NEXT_PUBLIC_LLM_MODEL ?? 'qwen2.5'
    const mode: LlmStructuredMode =
      process.env.NEXT_PUBLIC_LLM_STRUCTURED_MODE === 'json_object' ? 'json_object' : 'json_schema'
    return {
      // Ollama ignores the key; keep the anthropic key if set (for a hosted OpenAI
      // proxy) else a dummy so the Bearer header is well-formed.
      apiKey: anthropicKey || 'ollama',
      apiBaseUrl: baseUrl,
      llmProvider: 'openai-compatible',
      oaiStructuredMode: mode,
      models: { gatekeeper: model, designer: model, builder: model, slotEdit: model },
    }
  }

  // Default: open-source model through the server proxy. The model id here is
  // what the agents put on the wire; the proxy pins it to server-side
  // LLM_MODEL regardless, so the two only need to agree for log readability.
  const model = process.env.NEXT_PUBLIC_LLM_MODEL ?? 'qwen2.5'
  const mode: LlmStructuredMode =
    process.env.NEXT_PUBLIC_LLM_STRUCTURED_MODE === 'json_object' ? 'json_object' : 'json_schema'
  return {
    apiKey: 'proxy',
    apiBaseUrl: '/api/llm',
    llmProvider: 'openai-compatible',
    oaiStructuredMode: mode,
    models: { gatekeeper: model, designer: model, builder: model, slotEdit: model },
  }
}
