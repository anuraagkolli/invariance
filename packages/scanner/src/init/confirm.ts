import { createInterface } from 'node:readline/promises'

import type { SlotAdvice } from './advise'

export type PromptFn = (question: string) => Promise<string>

/** A readline-backed prompt for real CLI use. */
export function makeReadlinePrompt(): { prompt: PromptFn; close: () => void } {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return {
    prompt: async (q: string) => (await rl.question(q)).trim(),
    close: () => rl.close(),
  }
}

const LEVEL_LABELS = ['0 locked', '1 recolor (F1)', '2 content (F2)', '3 layout (F3)', '4 components (F4)']

/**
 * Walk the advised levels with the developer. "Accept all" applies the
 * recommendations; otherwise each slot is prompted (empty input keeps the
 * advised level). Returns slotName -> chosen level.
 */
export async function confirmLevels(advice: SlotAdvice[], prompt: PromptFn): Promise<Map<string, number>> {
  const chosen = new Map<string, number>()

  process.stdout.write('\nRecommended customization levels:\n')
  for (const a of advice) {
    process.stdout.write(`  ${a.slot} → ${LEVEL_LABELS[a.level] ?? a.level}  (${a.rationale})\n`)
  }

  const acceptAll = (await prompt('\nAccept all recommendations? [Y/n] ')).toLowerCase()
  if (acceptAll === '' || acceptAll === 'y' || acceptAll === 'yes') {
    for (const a of advice) chosen.set(a.slot, a.level)
    return chosen
  }

  for (const a of advice) {
    const raw = await prompt(`  ${a.slot} level [0-4] (enter=${a.level}): `)
    if (raw === '') {
      chosen.set(a.slot, a.level)
      continue
    }
    const n = Number.parseInt(raw, 10)
    chosen.set(a.slot, Number.isInteger(n) && n >= 0 && n <= 4 ? n : a.level)
  }
  return chosen
}
