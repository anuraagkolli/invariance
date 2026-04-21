import { unlock, showStatus, resolveConfigPath, VALID_SECTIONS } from '../unlock'

export interface UnlockArgs {
  section: string | null
  status: boolean
  dryRun: boolean
  level: number | null
  appPath: string | null
  pageRoute: string | null
}

export function parseUnlockArgs(argv: string[]): UnlockArgs | { help: true } {
  const args = argv
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
    if (a === '--help' || a === '-h') return { help: true }
    if (a === '--level') {
      const v = args[i + 1]
      if (!v || isNaN(Number(v))) {
        process.stderr.write('error: --level requires a number (0-4)\n')
        return { section: null, status: false, dryRun: false, level: null, appPath: null, pageRoute: null }
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

export const UNLOCK_USAGE =
  `Usage: invariance unlock <section> [options]\n` +
  `\n` +
  `Sections:\n` +
  `  colors        Unlock colors (any valid color allowed)\n` +
  `  fonts         Unlock fonts (remove font allowlist)\n` +
  `  spacing       Unlock spacing (remove spacing scale)\n` +
  `  content       Enable content editing (F2, bumps page levels to 2)\n` +
  `  layout        Unlock layout (clear locked sections, F3)\n` +
  `  components    Enable component swaps (F4, bumps page levels to 4)\n` +
  `  page <route>  Set a specific page level (requires --level)\n` +
  `  all           Unlock everything to level 4\n` +
  `\n` +
  `Options:\n` +
  `  --status      Show current lock status of all sections\n` +
  `  --level <n>   Set level (required for 'page' section)\n` +
  `  --dry-run     Preview changes without writing\n` +
  `  --config <p>  Path to app directory (default: current directory)\n` +
  `  -h, --help    Show this help message\n` +
  `\n` +
  `Examples:\n` +
  `  invariance unlock --status\n` +
  `  invariance unlock colors\n` +
  `  invariance unlock layout --dry-run\n` +
  `  invariance unlock page / --level 3\n` +
  `  invariance unlock all\n`

export async function runUnlock(argv: string[]): Promise<number> {
  const parsed = parseUnlockArgs(argv)
  if ('help' in parsed) {
    process.stderr.write(UNLOCK_USAGE)
    return argv.includes('--help') || argv.includes('-h') ? 0 : 1
  }

  const configPath = parsed.appPath
    ? resolveConfigPath(parsed.appPath)
    : resolveConfigPath()

  if (parsed.status) {
    try {
      const output = await showStatus(configPath)
      process.stdout.write(output + '\n')
      return 0
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      process.stderr.write(`error: ${msg}\n`)
      return 1
    }
  }

  if (!parsed.section) {
    process.stderr.write(UNLOCK_USAGE)
    return 1
  }

  if (!VALID_SECTIONS.includes(parsed.section)) {
    process.stderr.write(
      `error: unknown section "${parsed.section}". Valid sections: ${VALID_SECTIONS.join(', ')}\n`,
    )
    return 1
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
      return 0
    }

    if (parsed.dryRun) {
      process.stdout.write('--- Dry run: changes that would be applied ---\n\n')
      process.stdout.write(result.yamlOut)
      process.stdout.write('\nRe-run without --dry-run to apply.\n')
      return 0
    }

    process.stdout.write(`Unlocked "${parsed.section}" in ${configPath}\n`)

    const pages = result.after.frontend?.pages ?? {}
    const beforePages = result.before.frontend?.pages ?? {}
    for (const [route, page] of Object.entries(pages)) {
      const prev = beforePages[route]?.level ?? 0
      if (page.level !== prev) {
        process.stdout.write(`  page ${route}: level ${prev} -> ${page.level}\n`)
      }
    }
    return 0
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`error: ${msg}\n`)
    return 1
  }
}
