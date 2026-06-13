#!/usr/bin/env node
import path from 'path'

import { runInit } from '../src/init/run'
import { makeReadlinePrompt } from '../src/init/confirm'

interface ParsedArgs {
  appPath: string
  apply: boolean
  yes: boolean
  apiKey: string | null
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2)
  let appPath: string | null = null
  let apply = false
  let yes = false
  let apiKey: string | null = null
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--apply') { apply = true; continue }
    if (a === '--yes' || a === '-y') { yes = true; continue }
    if (a === '--api-key') { apiKey = args[i + 1] ?? null; i++; continue }
    if (a === '--help' || a === '-h') { printUsage(); process.exit(0) }
    if (a && !a.startsWith('--')) { appPath = a; continue }
  }
  if (!appPath) { printUsage(); process.exit(1) }
  return { appPath, apply, yes, apiKey }
}

function printUsage(): void {
  process.stderr.write(
    'Usage: invariance-init <app-path> [--apply] [--yes] [--api-key <key>]\n' +
      '\n' +
      '  Guided onboarding: discover -> analyze -> choose invariants -> wrap -> verify.\n' +
      '  Default is dry-run (prints the diff). --apply writes files.\n' +
      '  --yes accepts all recommended levels non-interactively.\n',
  )
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv)
  const appRoot = path.resolve(parsed.appPath)
  const apiKey = parsed.apiKey ?? process.env.ANTHROPIC_API_KEY ?? process.env.NEXT_PUBLIC_ANTHROPIC_DEV_API_KEY ?? ''

  const rl = parsed.yes ? null : makeReadlinePrompt()
  const prompt = parsed.yes ? async () => 'y' : rl!.prompt

  try {
    const result = await runInit({ appRoot, apiKey, apply: parsed.apply, prompt })
    if (!parsed.apply) {
      process.stdout.write(result.diff)
      process.stdout.write('\n\nDry run. Re-run with --apply to write files.\n')
    } else {
      process.stdout.write(`\n✓ Onboarding applied. invariance check: ${result.checkPassed ? 'passed' : 'FAILED'}\n`)
      process.stdout.write('Next: set an LLM key (NEXT_PUBLIC_ANTHROPIC_DEV_API_KEY) for natural-language prompts; theme packs work without one.\n')
      process.stdout.write('Run `pnpm dev` and open the customization panel.\n')
    }
  } catch (err) {
    process.stderr.write(`invariance-init: ${err instanceof Error ? err.message : String(err)}\n`)
    process.exitCode = 1
  } finally {
    rl?.close()
  }
}

void main()
