#!/usr/bin/env node
import { unlock, showStatus, resolveConfigPath, VALID_SECTIONS } from '../src/unlock'

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

interface ParsedArgs {
  section: string | null
  status: boolean
  dryRun: boolean
  level: number | null
  appPath: string | null
  pageRoute: string | null
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2)
  let section: string | null = null
  let status = false
  let dryRun = false
  let level: number | null = null
  let appPath: string | null = null
  let pageRoute: string | null = null

  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    if (a === '--status') { status = true; continue }
    if (a === '--dry-run') { dryRun = true; continue }
    if (a === '--help' || a === '-h') { printUsage(); process.exit(0) }
    if (a === '--level') {
      const v = args[i + 1]
      if (!v || isNaN(Number(v))) {
        process.stderr.write('error: --level requires a number (0-4)\n')
        process.exit(1)
      }
      level = Number(v)
      i++
      continue
    }
    if (a === '--config') {
      appPath = args[i + 1] ?? null
      i++
      continue
    }
    if (!a.startsWith('--')) {
      if (!section) {
        section = a
      } else if (section === 'page' && !pageRoute) {
        pageRoute = a
      }
    }
  }

  return { section, status, dryRun, level, appPath, pageRoute }
}

function printUsage(): void {
  process.stderr.write(
    `Usage: invariance-unlock <section> [options]

Sections:
  colors        Unlock colors (any valid color allowed)
  fonts         Unlock fonts (remove font allowlist)
  spacing       Unlock spacing (remove spacing scale)
  content       Enable content editing (F2, bumps page levels to 2)
  layout        Unlock layout (clear locked sections, F3)
  components    Enable component swaps (F4, bumps page levels to 4)
  page <route>  Set a specific page level (requires --level)
  all           Unlock everything to level 4

Options:
  --status      Show current lock status of all sections
  --level <n>   Set level (required for 'page' section)
  --dry-run     Preview changes without writing
  --config <p>  Path to app directory (default: current directory)
  -h, --help    Show this help message

Examples:
  invariance-unlock --status
  invariance-unlock colors
  invariance-unlock layout --dry-run
  invariance-unlock page / --level 3
  invariance-unlock all
`,
  )
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv)

  const configPath = parsed.appPath
    ? resolveConfigPath(parsed.appPath)
    : resolveConfigPath()

  if (parsed.status) {
    try {
      const output = await showStatus(configPath)
      process.stdout.write(output + '\n')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      process.stderr.write(`error: ${msg}\n`)
      process.exit(1)
    }
    return
  }

  if (!parsed.section) {
    printUsage()
    process.exit(1)
  }

  if (!VALID_SECTIONS.includes(parsed.section)) {
    process.stderr.write(
      `error: unknown section "${parsed.section}". Valid sections: ${VALID_SECTIONS.join(', ')}\n`,
    )
    process.exit(1)
  }

  try {
    const result = await unlock({
      configPath,
      section: parsed.section,
      pageRoute: parsed.pageRoute ?? undefined,
      pageLevel: parsed.level ?? undefined,
      dryRun: parsed.dryRun,
    })

    if (!result.changed) {
      process.stdout.write(`Already unlocked — no changes needed.\n`)
      return
    }

    if (parsed.dryRun) {
      process.stdout.write('--- Dry run: changes that would be applied ---\n\n')
      process.stdout.write(result.yamlOut)
      process.stdout.write('\nRe-run without --dry-run to apply.\n')
      return
    }

    process.stdout.write(`Unlocked "${parsed.section}" in ${configPath}\n`)

    // Show page levels that were bumped
    const pages = result.after.frontend?.pages ?? {}
    const beforePages = result.before.frontend?.pages ?? {}
    for (const [route, page] of Object.entries(pages)) {
      const prev = beforePages[route]?.level ?? 0
      if (page.level !== prev) {
        process.stdout.write(`  page ${route}: level ${prev} -> ${page.level}\n`)
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`error: ${msg}\n`)
    process.exit(1)
  }
}

void main()
