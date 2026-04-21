import { Node, Project, SourceFile, SyntaxKind } from 'ts-morph'

import type { ObservedValue } from '../types'
import { roleForCssProperty } from './variable-naming'

// ---------------------------------------------------------------------------
// Variable rewriter: replaces literal design values (hex colors, tailwind
// arbitrary values, tailwind named classes) with references to the --inv-*
// CSS variables assigned to the enclosing slot.
// ---------------------------------------------------------------------------

export interface VariableRewriteOptions {
  valuesBySlot: Map<string, ObservedValue[]>
  slotCssVariables: Record<string, string[]>
  slotVariableInitialValues: Record<string, Record<string, string>>
}

function warn(msg: string): void {
  process.stderr.write(`[scanner:variable-rewriter] ${msg}\n`)
}

/** Normalize a hex color to uppercase 6-digit form for comparison. */
function normalizeHex(value: string): string {
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(value.trim())
  if (!m || !m[1]) return value
  let hex = m[1]
  if (hex.length === 3) {
    hex = hex.split('').map((c) => c + c).join('')
  }
  return `#${hex.toUpperCase()}`
}

function findVariableForRole(
  slotName: string,
  role: string,
  value: string,
  opts: VariableRewriteOptions,
): string | null {
  const vars = opts.slotCssVariables[slotName] ?? []
  const initialValues = opts.slotVariableInitialValues[slotName] ?? {}
  // Variable names look like --inv-<slot>-<abbrev>[-n]; match by role abbrev.
  const matching = vars.filter((v) => {
    // Strip leading "--inv-<kebab(slot)>-".
    const parts = v.split('-').filter(Boolean)
    // Last segment may be a collision suffix number; otherwise the role abbrev.
    const tail = parts[parts.length - 1]
    const prev = parts[parts.length - 2]
    if (tail && /^\d+$/.test(tail)) return prev === role
    return tail === role
  })
  if (matching.length === 0) return null
  if (matching.length === 1) return matching[0] ?? null

  // Multiple variables match the role — find the one whose initial value
  // matches the observed value to pick the correct collision-suffixed variant.
  const normalized = normalizeHex(value)
  for (const varName of matching) {
    const initial = initialValues[varName]
    if (initial && normalizeHex(initial) === normalized) {
      return varName
    }
  }

  // Fallback: return first match (shouldn't normally reach here)
  warn(`ambiguous role match for slot '${slotName}' role '${role}' value '${value}'; using first match`)
  return matching[0] ?? null
}

function replaceStringLiteralValue(node: Node, newValue: string): void {
  // Preserve the quote style when replacing.
  const original = node.getText()
  const quote = original.startsWith('"') ? '"' : "'"
  node.replaceWithText(`${quote}${newValue}${quote}`)
}

function rewriteInlineStyle(
  sourceFile: SourceFile,
  observed: ObservedValue,
  varName: string,
): boolean {
  if (observed.source.kind !== 'inline-style') return false
  const property = observed.source.property
  let changed = false
  sourceFile.forEachDescendant((node) => {
    if (changed) return
    if (node.getKind() !== SyntaxKind.PropertyAssignment) return
    const pa = node.asKindOrThrow(SyntaxKind.PropertyAssignment)
    const name = pa.getName()
    if (name !== property) return
    const init = pa.getInitializer()
    if (!init) return
    if (init.getKind() !== SyntaxKind.StringLiteral) return
    const literal = init.asKindOrThrow(SyntaxKind.StringLiteral)
    if (literal.getLiteralText() !== observed.value) return
    replaceStringLiteralValue(literal, `var(${varName})`)
    changed = true
  })
  return changed
}

function rewriteClassNameToken(
  sourceFile: SourceFile,
  oldToken: string,
  newToken: string,
): boolean {
  let changed = false
  sourceFile.forEachDescendant((node) => {
    if (changed) return
    if (node.getKind() !== SyntaxKind.JsxAttribute) return
    const attr = node.asKindOrThrow(SyntaxKind.JsxAttribute)
    if (attr.getNameNode().getText() !== 'className') return
    const init = attr.getInitializer()
    if (!init) return
    // className="..." (StringLiteral)
    if (init.getKind() === SyntaxKind.StringLiteral) {
      const lit = init.asKindOrThrow(SyntaxKind.StringLiteral)
      const raw = lit.getLiteralText()
      const tokens = raw.split(/\s+/)
      const idx = tokens.indexOf(oldToken)
      if (idx === -1) return
      tokens[idx] = newToken
      replaceStringLiteralValue(lit, tokens.join(' '))
      changed = true
      return
    }
    // className={'...'} (JsxExpression wrapping a StringLiteral)
    if (init.getKind() === SyntaxKind.JsxExpression) {
      const jsxExpr = init.asKindOrThrow(SyntaxKind.JsxExpression)
      const inner = jsxExpr.getExpression()
      if (!inner) return
      if (inner.getKind() === SyntaxKind.StringLiteral) {
        const lit = inner.asKindOrThrow(SyntaxKind.StringLiteral)
        const raw = lit.getLiteralText()
        const tokens = raw.split(/\s+/)
        const idx = tokens.indexOf(oldToken)
        if (idx === -1) return
        tokens[idx] = newToken
        replaceStringLiteralValue(lit, tokens.join(' '))
        changed = true
      }
    }
  })
  return changed
}

function tailwindPrefixForRole(role: string): string | null {
  if (role === 'bg') return 'bg'
  if (role === 'text') return 'text'
  if (role === 'border') return 'border'
  return null
}

export function applyVariableRewrites(
  project: Project,
  opts: VariableRewriteOptions,
): void {
  for (const [slotName, values] of opts.valuesBySlot) {
    for (const observed of values) {
      const role = roleForCssProperty(
        observed.source.kind === 'inline-style'
          ? observed.source.property
          : observed.role,
      ) ?? observed.role
      const varName = findVariableForRole(slotName, role, observed.value, opts)
      if (!varName) {
        warn(`no css variable for slot '${slotName}' role '${role}' (value ${observed.value})`)
        continue
      }

      const sourceFile = project.getSourceFile(observed.file)
      if (!sourceFile) {
        warn(`source file not loaded: ${observed.file}`)
        continue
      }

      if (observed.source.kind === 'inline-style') {
        if (!rewriteInlineStyle(sourceFile, observed, varName)) {
          warn(
            `could not rewrite inline-style ${observed.source.property}=${observed.value} in ${observed.file}`,
          )
        }
        continue
      }

      if (observed.source.kind === 'tailwind-arbitrary') {
        const prefix = observed.source.prefix
        // source.raw is the inner bracket content (e.g. "#1a1a2e"); rebuild full token.
        const oldToken = `${prefix}-[${observed.source.raw}]`
        const newToken = `${prefix}-[var(${varName})]`
        if (!rewriteClassNameToken(sourceFile, oldToken, newToken)) {
          warn(`could not rewrite tailwind-arbitrary ${oldToken} in ${observed.file}`)
        }
        continue
      }

      if (observed.source.kind === 'tailwind-named') {
        const prefix = tailwindPrefixForRole(role) ?? observed.source.prefix
        const oldToken = observed.source.className
        const newToken = `${prefix}-[var(${varName})]`
        if (!rewriteClassNameToken(sourceFile, oldToken, newToken)) {
          warn(`could not rewrite tailwind-named ${oldToken} in ${observed.file}`)
        }
      }
    }
  }
}
