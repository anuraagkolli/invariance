#!/usr/bin/env node
import path from 'path'

import { runCheck } from '../src/check'
import type { CheckResult, CheckViolation } from '../src/check'

interface ParsedArgs {
  appPath: string
  json: boolean
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2)
  let appPath: string | null = null
  let json = false

  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    if (a === '--json') {
      json = true
      continue
    }
    if (a === '--help' || a === '-h') {
      printUsage()
      process.exit(0)
    }
    if (!a.startsWith('--')) {
      appPath = a
      continue
    }
  }

  return { appPath: appPath ?? process.cwd(), json }
}

function printUsage(): void {
  process.stderr.write(
    `Usage: invariance-check [app-path] [options]

  CI guard. Fails (exit 1) when the committed invariance.config + theme registry
  declares a slot, token, or section that has vanished from source, or when a
  hardcoded design value reappears inside a wrapped slot.

Arguments:
  app-path      Path to the app directory (default: current directory).

Options:
  --json        Emit the CheckResult as JSON (for CI consumption).
  -h, --help    Show this help message.

Exit codes:
  0   No violations.
  1   One or more violations found.
`,
  )
}

const KIND_LABEL: Record<CheckViolation['kind'], string> = {
  'missing-slot': 'Missing slots',
  'missing-token': 'Missing tokens',
  'missing-section': 'Missing sections',
  'hardcoded-value': 'Hardcoded values',
  'unused-slot-token': 'Unused slot tokens',
}

function printHuman(result: CheckResult, appRoot: string): void {
  if (result.ok) {
    process.stdout.write(
      `invariance-check: OK — ${appRoot}\n` +
        `  checked ${result.checked.slots} slot(s), ` +
        `${result.checked.tokens} token(s), ` +
        `${result.checked.sections} section(s)\n`,
    )
    return
  }

  process.stderr.write(`invariance-check: FAILED — ${appRoot}\n\n`)

  // Group violations by kind, preserving the order in KIND_LABEL.
  const order: CheckViolation['kind'][] = [
    'missing-slot',
    'missing-token',
    'missing-section',
    'hardcoded-value',
    'unused-slot-token',
  ]
  for (const kind of order) {
    const group = result.violations.filter((v) => v.kind === kind)
    if (group.length === 0) continue
    process.stderr.write(`${KIND_LABEL[kind]} (${group.length}):\n`)
    for (const v of group) {
      process.stderr.write(`  - ${v.detail}\n`)
    }
    process.stderr.write('\n')
  }

  process.stderr.write(
    `${result.violations.length} violation(s) across ` +
      `${result.checked.slots} slot(s), ` +
      `${result.checked.tokens} token(s), ` +
      `${result.checked.sections} section(s).\n`,
  )
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv)
  const appRoot = path.resolve(parsed.appPath)

  try {
    const result = await runCheck(appRoot)

    if (parsed.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n')
    } else {
      printHuman(result, appRoot)
    }

    process.exit(result.ok ? 0 : 1)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`invariance-check: ${msg}\n`)
    process.exit(1)
  }
}

void main()
