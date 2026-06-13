import type { InvarianceConfig } from 'invariance'

import { analyze, writeMigration } from '../migrate'
import type { SlotChoiceInput } from '../migrate'
import { runCheck } from '../check'
import { adviseLevels } from './advise'
import { confirmLevels } from './confirm'
import type { PromptFn } from './confirm'

export interface RunInitOptions {
  appRoot: string
  apiKey: string
  apply: boolean
  /** Injectable prompt; the CLI passes a readline-backed one, tests a stub. */
  prompt: PromptFn
}

export interface RunInitResult {
  config: InvarianceConfig
  checkPassed: boolean
  report: string
  diff: string
}

/**
 * The guided onboarding flow: discover → analyze → advise + confirm levels →
 * write (source + globals.css + SSR + config) → check → report. Selection is
 * advisory (deterministic recommendation) but human-confirmed; deterministic
 * code performs every mutation.
 */
export async function runInit(opts: RunInitOptions): Promise<RunInitResult> {
  const chooseLevels = async (slots: SlotChoiceInput[]): Promise<Map<string, number>> => {
    const advice = adviseLevels(slots)
    return confirmLevels(advice, opts.prompt)
  }

  const result = await analyze({
    appRoot: opts.appRoot,
    apiKey: opts.apiKey,
    dryRun: !opts.apply,
    chooseLevels,
  })

  if (opts.apply) {
    await writeMigration(result)
  }

  let checkPassed = false
  if (opts.apply) {
    const check = await runCheck(opts.appRoot)
    checkPassed = check.ok
  }

  return { config: result.plan.config, checkPassed, report: result.report, diff: result.diff }
}
