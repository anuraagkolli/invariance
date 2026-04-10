import type { SemanticResult, StaticExtraction } from '../types'

// ---------------------------------------------------------------------------
// Text plan: identity-map the semantic texts, validated against extraction.
// ---------------------------------------------------------------------------

export interface TextPlanEntry {
  name: string
  file: string
  jsxPath: string
}

export function buildTextPlan(
  extraction: StaticExtraction,
  semantic: SemanticResult,
): TextPlanEntry[] {
  const known = new Set<string>()
  for (const t of extraction.texts) {
    known.add(`${t.file}::${t.jsxPath}`)
  }

  const entries: TextPlanEntry[] = []
  const seenNames = new Set<string>()

  for (const t of semantic.texts) {
    const key = `${t.file}::${t.jsxPath}`
    if (!known.has(key)) {
      process.stderr.write(
        `text-plan: semantic text '${t.name}' at ${key} not present in extraction, skipping\n`,
      )
      continue
    }
    let name = t.name
    let counter = 1
    while (seenNames.has(name)) {
      counter += 1
      name = `${t.name}-${counter}`
    }
    seenNames.add(name)
    entries.push({ name, file: t.file, jsxPath: t.jsxPath })
  }

  return entries
}
