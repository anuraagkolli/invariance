#!/usr/bin/env node
import { promises as fs } from 'fs'
import path from 'path'

import { migrate } from '../src/migrate'

interface ParsedArgs {
  appPath: string
  apply: boolean
  apiKey: string | null
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2)
  let appPath: string | null = null
  let apply = false
  let apiKey: string | null = null

  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--apply') {
      apply = true
      continue
    }
    if (a === '--api-key') {
      apiKey = args[i + 1] ?? null
      i++
      continue
    }
    if (a === '--help' || a === '-h') {
      printUsage()
      process.exit(0)
    }
    if (a && !a.startsWith('--')) {
      appPath = a
      continue
    }
  }

  if (!appPath) {
    printUsage()
    process.exit(1)
  }

  return { appPath, apply, apiKey }
}

function printUsage(): void {
  process.stderr.write(
    'Usage: invariance-scan <app-path> [--apply] [--api-key <key>]\n' +
      '\n' +
      '  Default is dry-run: prints a unified diff and writes a migration report to\n' +
      '  <app-path>/.invariance-migration-report.md\n' +
      '\n' +
      '  --apply      Actually write modified source files, invariance.config.yaml,\n' +
      '               and invariance.theme.initial.json.\n' +
      '  --api-key    Anthropic API key (falls back to ANTHROPIC_API_KEY env var).\n',
  )
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv)
  const apiKey = parsed.apiKey ?? process.env.ANTHROPIC_API_KEY ?? ''
  if (!apiKey) {
    process.stderr.write(
      'warning: no Anthropic API key provided; the scanner will use deterministic fallback naming\n',
    )
  }

  const appRoot = path.resolve(parsed.appPath)

  try {
    const result = await migrate({ appRoot, apiKey, dryRun: !parsed.apply })

    const reportPath = path.join(appRoot, '.invariance-migration-report.md')
    await fs.writeFile(reportPath, result.report, 'utf-8')

    if (!parsed.apply) {
      process.stdout.write(result.diff)
      process.stdout.write(`\n\nReport written to ${reportPath}\n`)
      process.stdout.write(
        `\nDry run. Re-run with --apply to write files to disk.\n`,
      )
      return
    }

    const slotCount = Object.keys(result.plan.slotCssVariables).length
    process.stdout.write(
      `Migration applied.\n` +
        `  app: ${result.plan.config.app}\n` +
        `  slots: ${slotCount}\n` +
        `  warnings: ${result.plan.warnings.length}\n` +
        `  report: ${reportPath}\n` +
        `  config: ${path.join(appRoot, 'invariance.config.yaml')}\n` +
        `  theme:  ${path.join(appRoot, 'invariance.theme.initial.json')}\n`,
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`invariance-scan: ${msg}\n`)
    process.exit(1)
  }
}

void main()
