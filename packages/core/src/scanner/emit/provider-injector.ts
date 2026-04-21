import { promises as fs } from 'fs'
import path from 'path'

import type { InvarianceConfig } from '../../config/types'

export interface InjectProviderResult {
  providersFile: string
  layoutPatched: boolean
  /** A copy-paste snippet printed to the report when layout shape is unexpected. */
  manualInstructions?: string
}

export function buildProvidersSource(
  config: InvarianceConfig,
  relativeThemePath: string,
): string {
  const configJson = JSON.stringify(config, null, 2)
    .split('\n')
    .map((line, i) => (i === 0 ? line : `  ${line}`))
    .join('\n')

  return `'use client'

import type { ReactNode } from 'react'
import { InvarianceProvider, CustomizationPanel } from 'invariance'
import type { InvarianceConfig, ThemeJson } from 'invariance'

import initialThemeJson from '${relativeThemePath}'

const config: InvarianceConfig = ${configJson}

interface ProvidersProps {
  children: ReactNode
}

export function Providers({ children }: ProvidersProps) {
  return (
    <InvarianceProvider
      config={config}
      apiKey={process.env.NEXT_PUBLIC_ANTHROPIC_DEV_API_KEY ?? ''}
      initialTheme={initialThemeJson as ThemeJson}
      storage="localStorage"
    >
      {children}
      <CustomizationPanel />
    </InvarianceProvider>
  )
}
`
}

const MANUAL_WIRING_SNIPPET =
  `// If layout auto-patching failed, add these two edits to your root layout.tsx manually:\n` +
  `//   1. at the top:     import { Providers } from './providers'\n` +
  `//   2. in the return:  wrap {children} in <Providers>{children}</Providers>\n`

/**
 * Patch a layout.tsx so `{children}` is wrapped in `<Providers>`, adding the
 * import. Idempotent: detects an existing wrap and no-ops. Returns the patched
 * source, or null when the layout shape is not recognized.
 */
export function patchLayoutSource(layoutSource: string): string | null {
  // Idempotency: already wrapped.
  if (/<Providers>[\s\S]*\{children\}[\s\S]*<\/Providers>/.test(layoutSource)) {
    return layoutSource
  }

  if (!layoutSource.includes('{children}')) return null

  let patched = layoutSource

  // Add the Providers import after the last existing import line, or at the top.
  const hasProvidersImport = /import\s*\{[^}]*\bProviders\b[^}]*\}\s*from\s*['"]\.\/providers['"]/.test(
    patched,
  )
  if (!hasProvidersImport) {
    const lastImportIdx = patched.lastIndexOf('\nimport ')
    if (lastImportIdx !== -1) {
      const endOfLine = patched.indexOf('\n', lastImportIdx + 1)
      patched =
        patched.slice(0, endOfLine + 1) +
        "import { Providers } from './providers'\n" +
        patched.slice(endOfLine + 1)
    } else {
      patched = "import { Providers } from './providers'\n" + patched
    }
  }

  patched = patched.replace(/\{children\}/g, '<Providers>{children}</Providers>')
  return patched
}

export async function injectProvider(
  layoutFile: string,
  appRoot: string,
  config: InvarianceConfig,
): Promise<InjectProviderResult> {
  const layoutDir = path.dirname(layoutFile)
  const providersFile = path.join(layoutDir, 'providers.tsx')

  const themeJsonPath = path.join(appRoot, 'invariance.theme.initial.json')
  let relTheme = path.relative(layoutDir, themeJsonPath)
  if (!relTheme.startsWith('.')) relTheme = `./${relTheme}`

  const providersSource = buildProvidersSource(config, relTheme)
  await fs.writeFile(providersFile, providersSource, 'utf-8')

  const layoutSource = await fs.readFile(layoutFile, 'utf-8')
  const patched = patchLayoutSource(layoutSource)
  if (patched === null) {
    return {
      providersFile,
      layoutPatched: false,
      manualInstructions: MANUAL_WIRING_SNIPPET,
    }
  }
  if (patched !== layoutSource) {
    await fs.writeFile(layoutFile, patched, 'utf-8')
  }
  return { providersFile, layoutPatched: true }
}

/** Write a minimal .env.example next to the app root, if missing. */
export async function writeEnvExample(appRoot: string): Promise<string | null> {
  const envExample = path.join(appRoot, '.env.example')
  try {
    await fs.access(envExample)
    return null
  } catch {
    // doesn't exist yet
  }
  const content =
    `# Anthropic API key for the runtime Gatekeeper + Builder agents.\n` +
    `# Warning: NEXT_PUBLIC_* vars are visible to the browser. For local dev only.\n` +
    `# For production, proxy through your own API route.\n` +
    `NEXT_PUBLIC_ANTHROPIC_DEV_API_KEY=sk-ant-...\n`
  await fs.writeFile(envExample, content, 'utf-8')
  return envExample
}
