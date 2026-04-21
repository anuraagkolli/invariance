import { promises as fs } from 'fs'
import path from 'path'

import { runScan } from './scan'

export const INIT_USAGE =
  `Usage: invariance init [app-path] [--api-key <key>]\n` +
  `\n` +
  `  Migrate an existing React/Next.js app and wire up the Invariance provider.\n` +
  `  Equivalent to \`invariance scan <app-path> --apply\` plus safety checks.\n` +
  `\n` +
  `  app-path    Defaults to current directory.\n` +
  `  --api-key   Anthropic API key for semantic slot naming.\n` +
  `              Falls back to ANTHROPIC_API_KEY or NEXT_PUBLIC_ANTHROPIC_DEV_API_KEY.\n` +
  `\n` +
  `Writes to the app directory:\n` +
  `  invariance.config.yaml          — your invariants (all levels start at 0)\n` +
  `  invariance.theme.initial.json   — scanner-observed defaults\n` +
  `  src/app/providers.tsx           — generated React provider\n` +
  `  src/app/layout.tsx              — patched to mount <Providers>\n` +
  `  .env.example                    — reminder to set NEXT_PUBLIC_ANTHROPIC_DEV_API_KEY\n` +
  `  .invariance-migration-report.md — summary of what changed\n`

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

export async function runInit(argv: string[]): Promise<number> {
  const args = argv

  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(INIT_USAGE)
    return 0
  }

  let appPath: string | null = null
  let apiKey: string | null = null
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    if (a === '--api-key') {
      apiKey = args[i + 1] ?? null
      i++
      continue
    }
    if (!a.startsWith('--')) {
      appPath = a
    }
  }

  const appRoot = path.resolve(appPath ?? '.')
  const existingConfig = path.join(appRoot, 'invariance.config.yaml')
  if (await fileExists(existingConfig)) {
    process.stdout.write(
      `${existingConfig} already exists.\n` +
        `This app is already initialized. To re-analyze without modifying:\n` +
        `  invariance scan ${appRoot}\n` +
        `To adjust unlocked sections:\n` +
        `  invariance unlock --status\n`,
    )
    return 0
  }

  const scanArgs: string[] = [appRoot, '--apply']
  if (apiKey) scanArgs.push('--api-key', apiKey)
  return runScan(scanArgs)
}
