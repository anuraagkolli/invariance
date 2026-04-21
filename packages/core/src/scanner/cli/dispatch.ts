import { runInit, INIT_USAGE } from './init'
import { runScan, SCAN_USAGE } from './scan'
import { runUnlock, UNLOCK_USAGE } from './unlock'

const TOP_LEVEL_USAGE =
  `invariance — make your React/Next.js app customizable by end-users\n` +
  `\n` +
  `Usage:\n` +
  `  invariance <command> [options]\n` +
  `\n` +
  `Commands:\n` +
  `  init [path]             Migrate an app and wire up the React provider (recommended).\n` +
  `  scan <path> [--apply]   Analyze an app; prints a diff. Add --apply to write changes.\n` +
  `  unlock <section>        Adjust invariance.config.yaml after migration.\n` +
  `  help [command]          Show help for a command.\n` +
  `\n` +
  `Global flags:\n` +
  `  -h, --help              Show this help.\n` +
  `  -v, --version           Print the installed invariance version.\n` +
  `\n` +
  `Examples:\n` +
  `  npx invariance init ./my-next-app\n` +
  `  npx invariance scan ./my-next-app\n` +
  `  npx invariance unlock colors\n` +
  `  npx invariance unlock page / --level 3\n`

function printHelp(command?: string): void {
  switch (command) {
    case 'init':
      process.stdout.write(INIT_USAGE)
      return
    case 'scan':
      process.stdout.write(SCAN_USAGE)
      return
    case 'unlock':
      process.stdout.write(UNLOCK_USAGE)
      return
    default:
      process.stdout.write(TOP_LEVEL_USAGE)
  }
}

function readPackageVersion(): string {
  // dispatch.js compiles to dist/src/scanner/cli/ — package.json is 4 levels up.
  const candidates = [
    '../../../../package.json',
    '../../../package.json',
    '../../package.json',
  ]
  for (const rel of candidates) {
    try {
      const pkg = require(rel) as { name?: string; version?: string }
      if (pkg?.name === 'invariance' && pkg.version) return pkg.version
    } catch {
      // try next
    }
  }
  return '0.0.0'
}

export async function dispatch(argv: string[]): Promise<number> {
  const args = argv.slice(2)
  const cmd = args[0]
  const rest = args.slice(1)

  if (!cmd || cmd === '-h' || cmd === '--help' || cmd === 'help') {
    printHelp(rest[0])
    return 0
  }

  if (cmd === '-v' || cmd === '--version') {
    process.stdout.write(`${readPackageVersion()}\n`)
    return 0
  }

  switch (cmd) {
    case 'init':
      return runInit(rest)
    case 'scan':
      return runScan(rest)
    case 'unlock':
      return runUnlock(rest)
    default:
      process.stderr.write(`Unknown command: ${cmd}\n\n`)
      printHelp()
      return 1
  }
}
