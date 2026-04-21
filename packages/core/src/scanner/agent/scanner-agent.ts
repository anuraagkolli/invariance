import type { CandidateSection, ObservedText, SemanticResult } from '../types'

// ---------------------------------------------------------------------------
// Input / output
// ---------------------------------------------------------------------------

export interface ScannerAgentInput {
  page: string
  pageFile: string
  sections: CandidateSection[]
  texts: ObservedText[]
  apiKey: string
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(): string {
  return `You are the Scanner agent for Invariance, a one-time migration assistant. Your ONLY job is to assign semantic names and boundaries to JSX sections and text literals in a Next.js/React page. You do NOT output colors, fonts, spacing, CSS, mutations, or any code.

STRICT RULES:
1. You receive a list of candidate sections (tag name, jsxPath, snippet, file, line) and a list of observed text literals.

2. SLOT NAMING — pick a short, lowercase, kebab-case semantic name that describes what the section IS, not where it sits:
   - Prefer established UI vocabulary: sidebar, header, footer, nav, main, hero, toolbar, dashboard, card, panel, banner, breadcrumb, search-bar, user-menu, notification-bell, chart-area, stats-grid, activity-feed.
   - Read the snippet and jsxPath carefully — a <nav> inside a flex layout is almost certainly "nav" or "sidebar", not "section-1".
   - If a section is a generic wrapper div with no styling of its own (it only positions children), name it after its primary child: a div that wraps <Sidebar /> is "sidebar-wrapper" or just "sidebar" if no inner slot is named that.
   - Never use generic names like section-1, section-2, block-a, area-b.

3. TEXT NAMING — for each text literal pick a descriptive kebab-case slug:
   - Reflect the content's purpose: 'app-name', 'page-title', 'nav-dashboard', 'nav-analytics', 'footer-copyright', 'metric-subtitle', 'cta-label'.
   - Never use generic names like text-1, text-2.
   - Names must be unique within the texts array.

4. Compute sectionOrder as the top-to-bottom document order of slot names (inputs are already in document order).

5. ALL slots MUST get level: 0 (locked). NEVER assign any other level.

6. Slots whose tag name or snippet indicate structural chrome (sidebar, header, footer, nav, toolbar) MUST get preserve: true. All others MUST get preserve: false.

7. For each slot output:
   - "description": one clear sentence (≤ 20 words) describing what the section renders and where it lives on screen. This is used by the runtime Gatekeeper to match natural-language requests like "change the sidebar color" to the correct slot. Be precise: "Left-hand vertical navigation panel containing app logo, nav links, and current user info" beats "Navigation area".
   - "aliases": 2-4 lowercase phrases a non-technical user might say when referring to this slot (e.g. ["sidebar", "left nav", "side menu", "navigation panel"] for the nav slot). Include both short and long forms. Omit only if the canonical name already covers every plausible phrasing.

8. FORBIDDEN: do not output colors, hex values, font names, spacing, CSS properties, class names, or any mutation. Only names and boundaries.

9. Output STRICT JSON matching the SemanticResult shape. NO markdown fences. NO prose. JSON only.

SHAPE:
{
  "page": "<the page path>",
  "slots": [
    {
      "name": "nav",
      "level": 0,
      "file": "src/components/Sidebar.tsx",
      "jsxPath": "nav",
      "preserve": true,
      "description": "Left-hand vertical navigation panel with app logo, nav links, and signed-in user info.",
      "aliases": ["sidebar", "left nav", "side menu", "navigation panel"]
    }
  ],
  "texts": [{"name":"app-name","file":"src/components/Sidebar.tsx","jsxPath":"nav>div>span"}],
  "sectionOrder": ["nav","header","main","footer"]
}`
}

// ---------------------------------------------------------------------------
// JSON extraction helper (mirrors gatekeeper)
// ---------------------------------------------------------------------------

function extractJson(text: string): unknown | undefined {
  try {
    return JSON.parse(text.trim())
  } catch {
    const fenceMatch = /```(?:json)?\s*([\s\S]*?)```/.exec(text)
    if (fenceMatch?.[1]) {
      try {
        return JSON.parse(fenceMatch[1].trim())
      } catch {
        // fall through
      }
    }
    return undefined
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isValidSemanticResult(value: unknown): value is SemanticResult {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (typeof v.page !== 'string') return false
  if (!Array.isArray(v.slots)) return false
  if (!Array.isArray(v.texts)) return false
  if (!Array.isArray(v.sectionOrder)) return false
  for (const s of v.slots) {
    if (!s || typeof s !== 'object') return false
    const slot = s as Record<string, unknown>
    if (
      typeof slot.name !== 'string' ||
      typeof slot.level !== 'number' ||
      typeof slot.file !== 'string' ||
      typeof slot.jsxPath !== 'string' ||
      typeof slot.preserve !== 'boolean'
    ) {
      return false
    }
    if (slot.description !== undefined && typeof slot.description !== 'string') return false
    if (slot.aliases !== undefined) {
      if (!Array.isArray(slot.aliases)) return false
      for (const a of slot.aliases) {
        if (typeof a !== 'string') return false
      }
    }
  }
  for (const t of v.texts) {
    if (!t || typeof t !== 'object') return false
    const text = t as Record<string, unknown>
    if (
      typeof text.name !== 'string' ||
      typeof text.file !== 'string' ||
      typeof text.jsxPath !== 'string'
    ) {
      return false
    }
  }
  for (const o of v.sectionOrder) {
    if (typeof o !== 'string') return false
  }
  return true
}

// ---------------------------------------------------------------------------
// Fallback deterministic result
// ---------------------------------------------------------------------------

function buildFallback(input: ScannerAgentInput): SemanticResult {
  const slots: SemanticResult['slots'] = input.sections.map((section, idx) => ({
    name: `section-${idx + 1}`,
    level: 0,
    file: section.file,
    jsxPath: section.jsxPath,
    preserve: idx === 0 || idx === input.sections.length - 1,
  }))
  const texts: SemanticResult['texts'] = input.texts.map((text, idx) => ({
    name: `text-${idx + 1}`,
    file: text.file,
    jsxPath: text.jsxPath,
  }))
  return {
    page: input.page,
    slots,
    texts,
    sectionOrder: slots.map((s) => s.name),
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function callScannerAgent(input: ScannerAgentInput): Promise<SemanticResult> {
  if (!input.apiKey) {
    process.stderr.write('scanner-agent: no API key provided, using fallback naming\n')
    return buildFallback(input)
  }

  const prunedSections = input.sections.map((s) => ({
    file: s.file,
    line: s.line,
    jsxPath: s.jsxPath,
    tagName: s.tagName,
    snippet: s.snippet,
  }))
  const prunedTexts = input.texts.map((t) => ({
    file: t.file,
    line: t.line,
    text: t.text,
    jsxPath: t.jsxPath,
  }))

  const userMessage = JSON.stringify(
    {
      page: input.page,
      pageFile: input.pageFile,
      sections: prunedSections,
      texts: prunedTexts,
    },
    null,
    2,
  )

  let response: Response
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': input.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-7',
        max_tokens: 4096,
        temperature: 0.1,
        system: buildSystemPrompt(),
        messages: [{ role: 'user', content: userMessage }],
      }),
    })
  } catch (err) {
    process.stderr.write(
      `scanner-agent: fetch failed (${(err as Error).message}), using fallback\n`,
    )
    return buildFallback(input)
  }

  if (!response.ok) {
    process.stderr.write(
      `scanner-agent: API returned ${response.status}, using fallback\n`,
    )
    return buildFallback(input)
  }

  let data: unknown
  try {
    data = await response.json()
  } catch {
    process.stderr.write('scanner-agent: invalid JSON response body, using fallback\n')
    return buildFallback(input)
  }

  let text: string | undefined
  try {
    const typed = data as { content: Array<{ type: string; text: string }> }
    text = typed.content.find((b) => b.type === 'text')?.text
  } catch {
    process.stderr.write('scanner-agent: unexpected response shape, using fallback\n')
    return buildFallback(input)
  }

  if (!text) {
    process.stderr.write('scanner-agent: empty response, using fallback\n')
    return buildFallback(input)
  }

  const parsed = extractJson(text)
  if (!isValidSemanticResult(parsed)) {
    process.stderr.write('scanner-agent: invalid SemanticResult shape, using fallback\n')
    return buildFallback(input)
  }

  // Enforce invariants the agent might violate even if the shape is valid.
  const normalized: SemanticResult = {
    page: input.page,
    slots: parsed.slots.map((s) => ({
      name: s.name,
      level: 0,
      file: s.file,
      jsxPath: s.jsxPath,
      preserve: s.preserve,
      ...(s.description ? { description: s.description } : {}),
      ...(s.aliases && s.aliases.length > 0
        ? { aliases: s.aliases.map((a) => a.toLowerCase()) }
        : {}),
    })),
    texts: parsed.texts,
    sectionOrder: parsed.sectionOrder,
  }

  return normalized
}
