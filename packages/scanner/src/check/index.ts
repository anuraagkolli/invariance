import { promises as fs } from 'fs'
import path from 'path'

import { parseConfig } from 'invariance'
import type { InvarianceConfig } from 'invariance'

import { scanMigratedSource } from './scan-source'
import type { SourceInventory } from './scan-source'

// ---------------------------------------------------------------------------
// invariance-check: a CI guard.
//
// Compares an app's committed registry (what the invariant config + initial
// theme say SHOULD exist) against the current state of its already-migrated
// source. Fails when a wrapped slot, advertised token, or known section has
// vanished from source without a migration, or when a hardcoded design value
// has reappeared inside a wrapped slot.
// ---------------------------------------------------------------------------

export interface CheckViolation {
  kind: 'missing-slot' | 'missing-token' | 'missing-section' | 'hardcoded-value'
  /** The slot / token / section name (or the literal value, for hardcoded). */
  name: string
  /** Human-readable explanation for the report. */
  detail: string
}

export interface CheckResult {
  ok: boolean
  violations: CheckViolation[]
  checked: { slots: number; tokens: number; sections: number }
}

/** The committed registry of what an app declares. */
interface Registry {
  /** Slot names the config requires (structure.required_sections + page.required). */
  slots: Set<string>
  /** --inv-* tokens the initial theme advertises (theme.roles + theme.slots keys). */
  tokens: Set<string>
  /** Page/section names the config knows (page routes -> m.page names). */
  sections: Set<string>
}

function routeToPageName(route: string): string {
  if (route === '/' || route === '') return 'home'
  return route.replace(/^\/+/, '').replace(/\//g, '-')
}

async function readJsonIfExists(filePath: string): Promise<unknown | undefined> {
  let raw: string
  try {
    raw = await fs.readFile(filePath, 'utf-8')
  } catch {
    return undefined
  }
  return JSON.parse(raw) as unknown
}

/**
 * Collect the --inv-* SLOT token keys from a theme.json (v1 or v2 shape).
 *
 * WHY slots only: slot tokens are the ones the scanner wires into source as
 * var(--inv-*) references — those are what a "missing-token" regression removes.
 * Role tokens (theme.roles) live on :root via the runtime/compiler and are
 * never referenced by name in source, so requiring them to appear in source
 * would false-positive on every healthy app. A v1 theme has no roles/slots
 * split: its globals partition into slots on upgrade, so we read globals here.
 */
function slotTokensFromTheme(theme: unknown): Set<string> {
  const out = new Set<string>()
  if (typeof theme !== 'object' || theme === null) return out
  const t = (theme as { theme?: unknown }).theme
  if (typeof t !== 'object' || t === null) return out
  // v2: theme.slots is a flat { '--inv-*': value } record.
  const slots = (t as Record<string, unknown>).slots
  if (typeof slots === 'object' && slots !== null) {
    for (const key of Object.keys(slots)) {
      if (key.startsWith('--inv-')) out.add(key)
    }
  }
  // v1: theme.globals carries flat --inv-* keys (these become slots on upgrade).
  const globals = (t as { globals?: unknown }).globals
  if (typeof globals === 'object' && globals !== null) {
    for (const key of Object.keys(globals)) {
      if (key.startsWith('--inv-')) out.add(key)
    }
  }
  return out
}

/**
 * Build the committed registry from the config + initial theme on disk.
 *
 * - Slots/sections come from the invariant config (the unlock command's source
 *   of truth): structure.required_sections + per-page required lists are the
 *   slot names; page routes map to m.page section names.
 * - Tokens come from the committed initial theme.json: the --inv-* keys it
 *   advertises are the contract the source must keep referencing.
 */
async function loadRegistry(appRoot: string): Promise<Registry> {
  const configPath = path.join(appRoot, 'invariance.config.yaml')
  const raw = await fs.readFile(configPath, 'utf-8')
  const config: InvarianceConfig = parseConfig(raw)

  const slots = new Set<string>()
  const sections = new Set<string>()

  const structure = config.frontend?.structure
  for (const name of structure?.required_sections ?? []) slots.add(name)

  for (const [route, page] of Object.entries(config.frontend?.pages ?? {})) {
    sections.add(routeToPageName(route))
    for (const name of page.required ?? []) slots.add(name)
  }

  // Tokens: prefer invariance.theme.initial.json (the scanner's emitted seed),
  // fall back to invariance.theme.json if a project renamed it.
  const tokens = new Set<string>()
  const themeCandidates = ['invariance.theme.initial.json', 'invariance.theme.json']
  for (const file of themeCandidates) {
    const theme = await readJsonIfExists(path.join(appRoot, file))
    if (theme !== undefined) {
      for (const tok of slotTokensFromTheme(theme)) tokens.add(tok)
      break
    }
  }

  return { slots, tokens, sections }
}

function computeViolations(
  registry: Registry,
  inventory: SourceInventory,
): CheckViolation[] {
  const violations: CheckViolation[] = []

  // missing-slot: a slot the config requires is no longer wrapped in source.
  for (const slot of registry.slots) {
    if (!inventory.slots.has(slot)) {
      violations.push({
        kind: 'missing-slot',
        name: slot,
        detail: `slot "${slot}" is required by the config but no <m.slot name="${slot}"> exists in source`,
      })
    }
  }

  // missing-token: a SLOT token the initial theme advertises no longer appears
  // in source — neither as a var(--inv-*) reference nor in any cssVariables
  // list. (Role tokens are excluded — they live on :root, not in source.)
  for (const token of registry.tokens) {
    if (!inventory.tokens.has(token)) {
      violations.push({
        kind: 'missing-token',
        name: token,
        detail: `token "${token}" is in the committed theme but no var(${token}) reference remains in source`,
      })
    }
  }

  // missing-section: a config-known page/section is no longer wrapped.
  for (const section of registry.sections) {
    if (!inventory.sections.has(section)) {
      violations.push({
        kind: 'missing-section',
        name: section,
        detail: `section "${section}" is known to the config but no <m.page name="${section}"> exists in source`,
      })
    }
  }

  // hardcoded-value: a literal design value reappeared inside a wrapped slot.
  //
  // LIMITATION (documented on purpose): attribution is scoped to the wrapped
  // slot's JSX subtree (see scan-source.ts), not to a precise element. A
  // migrated slot should reference var(--inv-*) tokens, so any hex/px/tailwind
  // color literal inside its subtree is flagged. Tokens themselves are never
  // literals, so this stays conservative; we do NOT scan unwrapped regions, to
  // avoid false positives on app chrome the scanner never touched.
  for (const [slot, literals] of inventory.literalsBySlot) {
    for (const literal of literals) {
      violations.push({
        kind: 'hardcoded-value',
        name: literal,
        detail: `hardcoded value "${literal}" found inside wrapped slot "${slot}"; it should reference a var(--inv-*) token`,
      })
    }
  }

  return violations
}

/**
 * Run the CI guard against an app directory. Loads the committed config + theme
 * registry, inventories the current (already-migrated) source, and reports any
 * slot/token/section that vanished or any hardcoded value that reappeared.
 */
export async function runCheck(appPath: string): Promise<CheckResult> {
  const appRoot = path.resolve(appPath)
  const registry = await loadRegistry(appRoot)
  const inventory = scanMigratedSource(appRoot)
  const violations = computeViolations(registry, inventory)

  return {
    ok: violations.length === 0,
    violations,
    checked: {
      slots: registry.slots.size,
      tokens: registry.tokens.size,
      sections: registry.sections.size,
    },
  }
}
