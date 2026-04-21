import { promises as fs } from 'fs'
import path from 'path'

import { migrate } from '../migrate'

export interface ScanArgs {
  appPath: string
  apply: boolean
  apiKey: string | null
}

export function parseScanArgs(argv: string[]): ScanArgs | { help: true } {
  const args = argv
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
      return { help: true }
    }
    if (a && !a.startsWith('--')) {
      appPath = a
      continue
    }
  }

  if (!appPath) {
    return { help: true }
  }

  return { appPath, apply, apiKey }
}

export const SCAN_USAGE =
  `Usage: invariance scan <app-path> [--apply] [--api-key <key>]\n` +
  `\n` +
  `  Analyze a React/Next.js app and report what migration would change.\n` +
  `  Default is dry-run: prints a unified diff and writes a report to\n` +
  `  <app-path>/.invariance-migration-report.md\n` +
  `\n` +
  `  --apply      Write modified source files, invariance.config.yaml,\n` +
  `               invariance.theme.initial.json, and patch layout.tsx.\n` +
  `  --api-key    Anthropic API key for semantic slot naming.\n` +
  `               Falls back to ANTHROPIC_API_KEY or NEXT_PUBLIC_ANTHROPIC_DEV_API_KEY.\n` +
  `               Without a key, slots get generic names (section-1, text-1, ...).\n`

function loadEnvFile(dir: string): void {
  const envPath = path.resolve(dir, '.env')
  let content: string
  try {
    content = require('fs').readFileSync(envPath, 'utf-8')
  } catch {
    return
  }
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue
    const key = trimmed.slice(0, eqIndex).trim()
    const value = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[key]) {
      process.env[key] = value
    }
  }
}

export async function runScan(argv: string[]): Promise<number> {
  const parsed = parseScanArgs(argv)
  if ('help' in parsed) {
    process.stderr.write(SCAN_USAGE)
    return parsed.help === true && argv.includes('--help') ? 0 : 1
  }

  const appRoot = path.resolve(parsed.appPath)

  loadEnvFile(appRoot)
  loadEnvFile(path.resolve(appRoot, '../..'))

  const apiKey =
    parsed.apiKey ??
    process.env.ANTHROPIC_API_KEY ??
    process.env.NEXT_PUBLIC_ANTHROPIC_DEV_API_KEY ??
    ''
  if (!apiKey) {
    process.stderr.write(
      'warning: no Anthropic API key provided; slots will get generic names.\n' +
        '         Set ANTHROPIC_API_KEY or pass --api-key <key> for semantic naming.\n',
    )
  }

  try {
    const result = await migrate({ appRoot, apiKey, dryRun: !parsed.apply })

    const reportPath = path.join(appRoot, '.invariance-migration-report.md')
    await fs.writeFile(reportPath, result.report, 'utf-8')

    if (!parsed.apply) {
      process.stdout.write(result.diff)
      process.stdout.write(`\n\nReport written to ${reportPath}\n`)
      process.stdout.write(`\nDry run. Re-run with --apply (or use \`invariance init\`) to write files.\n`)
      return 0
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
    return 0
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`invariance scan: ${msg}\n`)
    return 1
  }
}
