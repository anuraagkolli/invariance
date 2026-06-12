#!/usr/bin/env node
import { promises as fs } from 'fs'
import path from 'path'

import { ROLE_TOKENS } from 'invariance'
import type { InvarianceConfig } from 'invariance'
import { parseConfig } from 'invariance'

import { migrateTheme } from '../src/migrate-theme'
import type { ThemeMigrationReport } from '../src/migrate-theme'
import { readJsonIfExists, slotTokensFromTheme } from '../src/check/theme-tokens'

interface ParsedArgs {
  themePath: string | null
  renamesPath: string | null
  writePath: string | null
  configPath: string | null
  json: boolean
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2)
  let themePath: string | null = null
  let renamesPath: string | null = null
  let writePath: string | null = null
  let configPath: string | null = null
  let json = false

  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    if (a === '--renames') {
      renamesPath = args[i + 1] ?? null
      i++
      continue
    }
    if (a === '--write') {
      writePath = args[i + 1] ?? null
      i++
      continue
    }
    if (a === '--config') {
      configPath = args[i + 1] ?? null
      i++
      continue
    }
    if (a === '--json') {
      json = true
      continue
    }
    if (a === '--help' || a === '-h') {
      printUsage()
      process.exit(0)
    }
    if (!a.startsWith('--')) {
      themePath = a
      continue
    }
  }

  return { themePath, renamesPath, writePath, configPath, json }
}

function printUsage(): void {
  process.stderr.write(
    `Usage: invariance-migrate-theme <theme-path> [options]

  Carry a stored user theme (v1 or v2) forward across a version bump. Same-named
  tokens/slots keep their values; tokens/slots the current registry no longer
  knows are dropped (reported); renamed keys move via --renames.

Arguments:
  theme-path        Path to the stored theme.json (v1 or v2).

Options:
  --renames <file>  JSON map of old key -> new key for renamed tokens/slots.
  --write <path>    Write the migrated theme to <path> (default: stdout).
  --config <path>   App directory or invariance.config.yaml to derive the slot
                    registry from (default: auto-discover from cwd).
  --json            Emit the full migration report (carried/dropped/renamed +
                    theme) instead of just the migrated theme.
  -h, --help        Show this help message.
`,
  )
}

/** Resolve a config path: accept a .yaml/.yml file, or a directory holding one. */
function resolveConfigPath(input: string): string {
  const abs = path.resolve(input)
  if (abs.endsWith('.yaml') || abs.endsWith('.yml')) return abs
  return path.join(abs, 'invariance.config.yaml')
}

/**
 * Build the current slot-token registry. The config itself only carries slot
 * NAMES, not their --inv-* tokens, so the source of truth for known slot tokens
 * is the app's committed initial theme.json. We read both the explicit
 * --config target's theme and a sibling initial theme.
 */
async function buildSlotRegistry(
  configPath: string,
  storedTheme: unknown,
): Promise<string[]> {
  const slots = new Set<string>()

  // Preferred source of truth: the app's committed initial theme. When present,
  // ITS slot tokens ARE the registry — a token the developer removed from the
  // app's theme drops from the user's stored theme too (the whole point).
  const appDir = path.dirname(configPath)
  let committedFound = false
  for (const file of ['invariance.theme.initial.json', 'invariance.theme.json']) {
    const theme = await readJsonIfExists(path.join(appDir, file))
    if (theme !== undefined) {
      for (const tok of slotTokensFromTheme(theme)) slots.add(tok)
      committedFound = true
      break
    }
  }

  // Fallback only when there's NO committed theme to diff against (migrate-theme
  // used standalone, e.g. piping a theme through a rename map): preserve the
  // stored theme's own non-role slot tokens rather than dropping everything.
  if (!committedFound) {
    const roleSet = new Set<string>(ROLE_TOKENS)
    for (const tok of slotTokensFromTheme(storedTheme)) {
      if (!roleSet.has(tok)) slots.add(tok)
    }
  }

  return Array.from(slots)
}

function printReport(report: ThemeMigrationReport): void {
  process.stderr.write('invariance-migrate-theme:\n')
  process.stderr.write(`  carried: ${report.carried.length}\n`)
  process.stderr.write(`  dropped: ${report.dropped.length}\n`)
  process.stderr.write(`  renamed: ${report.renamed.length}\n`)
  if (report.dropped.length > 0) {
    process.stderr.write(`  dropped keys: ${report.dropped.join(', ')}\n`)
  }
  for (const r of report.renamed) {
    process.stderr.write(`  renamed: ${r.from} -> ${r.to}\n`)
  }
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv)

  if (!parsed.themePath) {
    printUsage()
    process.exit(1)
  }

  try {
    const themeRaw = await fs.readFile(path.resolve(parsed.themePath), 'utf-8')
    const storedTheme: unknown = JSON.parse(themeRaw)

    let renames: Record<string, string> = {}
    if (parsed.renamesPath) {
      const renamesRaw = await fs.readFile(path.resolve(parsed.renamesPath), 'utf-8')
      renames = JSON.parse(renamesRaw) as Record<string, string>
    }

    // Resolve the config path. The slot registry is built from the app's theme
    // files independently of the config (see buildSlotRegistry), so a missing
    // config is fine — migrate-theme stays usable standalone (e.g. piping a
    // theme through a rename map). But a config that IS present yet doesn't
    // parse signals a broken app: warn to stderr so it isn't silently ignored,
    // then proceed (the registry doesn't depend on the parsed result).
    const configPath = resolveConfigPath(parsed.configPath ?? process.cwd())
    let configRaw: string | undefined
    try {
      configRaw = await fs.readFile(configPath, 'utf-8')
    } catch {
      // Absent/unreadable: legitimate standalone use; nothing to warn about.
      configRaw = undefined
    }
    if (configRaw !== undefined) {
      try {
        const config: InvarianceConfig = parseConfig(configRaw)
        void config
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        process.stderr.write(
          `invariance-migrate-theme: warning: config at ${configPath} did not parse (${msg}); proceeding with theme-file-derived registry\n`,
        )
      }
    }

    const slots = await buildSlotRegistry(configPath, storedTheme)
    const report = migrateTheme(storedTheme, { roles: [...ROLE_TOKENS], slots }, renames)

    const themeJson = JSON.stringify(report.theme, null, 2) + '\n'

    if (parsed.writePath) {
      await fs.writeFile(path.resolve(parsed.writePath), themeJson, 'utf-8')
      printReport(report)
      process.stdout.write(`Migrated theme written to ${path.resolve(parsed.writePath)}\n`)
    } else if (parsed.json) {
      process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    } else {
      printReport(report)
      process.stdout.write(themeJson)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`invariance-migrate-theme: ${msg}\n`)
    process.exit(1)
  }
}

void main()
