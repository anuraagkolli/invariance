import { promises as fs } from 'fs'
import path from 'path'

export interface DiscoveredApp {
  appRoot: string
  packageJsonName: string
  pages: Array<{ route: string; file: string }>
  tailwindConfigPath: string | null
}

const TAILWIND_CONFIG_CANDIDATES = [
  'tailwind.config.ts',
  'tailwind.config.js',
  'tailwind.config.mjs',
  'tailwind.config.cjs',
]

const PAGE_EXTENSIONS = ['.tsx', '.jsx', '.ts', '.js']

async function fileExists(p: string): Promise<boolean> {
  try {
    const stat = await fs.stat(p)
    return stat.isFile()
  } catch {
    return false
  }
}

async function dirExists(p: string): Promise<boolean> {
  try {
    const stat = await fs.stat(p)
    return stat.isDirectory()
  } catch {
    return false
  }
}

async function readPackageJsonName(appRoot: string): Promise<string> {
  const pkgPath = path.join(appRoot, 'package.json')
  const raw = await fs.readFile(pkgPath, 'utf-8')
  const parsed: unknown = JSON.parse(raw)
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'name' in parsed &&
    typeof (parsed as { name: unknown }).name === 'string'
  ) {
    return (parsed as { name: string }).name
  }
  return path.basename(appRoot)
}

async function findTailwindConfig(appRoot: string): Promise<string | null> {
  for (const candidate of TAILWIND_CONFIG_CANDIDATES) {
    const p = path.join(appRoot, candidate)
    if (await fileExists(p)) return p
  }
  return null
}

/**
 * Find the app's source root. Next.js projects commonly use either
 * `<appRoot>/src/app` or `<appRoot>/app`.
 */
async function findAppRouterRoot(appRoot: string): Promise<string | null> {
  const candidates = [path.join(appRoot, 'src', 'app'), path.join(appRoot, 'app')]
  for (const c of candidates) {
    if (await dirExists(c)) return c
  }
  return null
}

async function findPagesRouterRoot(appRoot: string): Promise<string | null> {
  const candidates = [path.join(appRoot, 'src', 'pages'), path.join(appRoot, 'pages')]
  for (const c of candidates) {
    if (await dirExists(c)) return c
  }
  return null
}

/** Walk a directory collecting every file that matches the predicate. */
async function walkDir(
  root: string,
  predicate: (fullPath: string, relPath: string) => boolean,
): Promise<string[]> {
  const out: string[] = []
  async function recurse(current: string): Promise<void> {
    let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>
    try {
      entries = await fs.readdir(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
      const full = path.join(current, entry.name)
      const rel = path.relative(root, full)
      if (entry.isDirectory()) {
        await recurse(full)
      } else if (entry.isFile() && predicate(full, rel)) {
        out.push(full)
      }
    }
  }
  await recurse(root)
  return out
}

function hasPageExtension(file: string): boolean {
  return PAGE_EXTENSIONS.some((ext) => file.endsWith(ext))
}

/** Convert an App Router file path to a route. */
function appRouterFileToRoute(appRoot: string, file: string): string | null {
  const base = path.basename(file)
  const nameNoExt = base.replace(/\.(tsx|ts|jsx|js)$/, '')
  if (nameNoExt !== 'page') return null
  const rel = path.relative(appRoot, path.dirname(file))
  if (rel === '' || rel === '.') return '/'
  const segments = rel.split(path.sep).filter((s) => !s.startsWith('(') && !s.startsWith('_'))
  if (segments.length === 0) return '/'
  return '/' + segments.join('/')
}

/** Convert a Pages Router file path to a route. */
function pagesRouterFileToRoute(pagesRoot: string, file: string): string | null {
  const rel = path.relative(pagesRoot, file)
  const noExt = rel.replace(/\.(tsx|ts|jsx|js)$/, '')
  const parts = noExt.split(path.sep)
  const last = parts[parts.length - 1]
  if (last === '_app' || last === '_document' || last === '_error') return null
  if (parts[0] === 'api') return null
  if (last === 'index') {
    const dirParts = parts.slice(0, -1)
    return dirParts.length === 0 ? '/' : '/' + dirParts.join('/')
  }
  return '/' + parts.join('/')
}

export async function discoverApp(appRoot: string): Promise<DiscoveredApp> {
  const absRoot = path.resolve(appRoot)
  const packageJsonName = await readPackageJsonName(absRoot)
  const tailwindConfigPath = await findTailwindConfig(absRoot)

  const pages: Array<{ route: string; file: string }> = []

  const appRouterRoot = await findAppRouterRoot(absRoot)
  if (appRouterRoot) {
    const files = await walkDir(appRouterRoot, (full) => {
      if (!hasPageExtension(full)) return false
      const base = path.basename(full)
      return /^page\.(tsx|ts|jsx|js)$/.test(base)
    })
    for (const file of files) {
      const route = appRouterFileToRoute(appRouterRoot, file)
      if (route) pages.push({ route, file })
    }
  }

  const pagesRouterRoot = await findPagesRouterRoot(absRoot)
  if (pagesRouterRoot) {
    const files = await walkDir(pagesRouterRoot, (full) => hasPageExtension(full))
    for (const file of files) {
      const route = pagesRouterFileToRoute(pagesRouterRoot, file)
      if (route) pages.push({ route, file })
    }
  }

  return {
    appRoot: absRoot,
    packageJsonName,
    pages,
    tailwindConfigPath,
  }
}
