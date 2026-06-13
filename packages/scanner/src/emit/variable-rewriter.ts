import { Node, Project, SourceFile, SyntaxKind } from 'ts-morph'
import type { JsxAttribute, JsxOpeningElement, JsxSelfClosingElement } from 'ts-morph'

import type { ObservedValue } from '../types'
import { jsxPathOf } from '../ast/parse'
import { roleForCssProperty } from './variable-naming'

// ---------------------------------------------------------------------------
// Variable rewriter: replaces literal design values (hex colors, tailwind
// arbitrary values, tailwind named classes) with references to the --inv-*
// CSS variables assigned to the enclosing slot.
//
// Each observed value carries the jsxPath of the element it was seen on, so a
// rewrite targets exactly that element. This is what lets two sibling slots
// share a literal value yet each reference its own token: without per-element
// targeting, the first slot processed would consume every file-wide occurrence.
// ---------------------------------------------------------------------------

type OpeningLike = JsxOpeningElement | JsxSelfClosingElement

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

function getNamedAttribute(opening: OpeningLike, name: string): JsxAttribute | null {
  for (const attr of opening.getAttributes()) {
    if (attr.getKind() !== SyntaxKind.JsxAttribute) continue
    const typed = attr as JsxAttribute
    if (typed.getNameNode().getText() === name) return typed
  }
  return null
}

/**
 * Find the JSX opening element at the given jsxPath. jsxPaths are unique within
 * a function; if a file declares several components that produce the same path,
 * `line` disambiguates. Returns undefined when no element matches.
 */
function findOpeningAt(
  sourceFile: SourceFile,
  jsxPath: string,
  line: number,
): OpeningLike | undefined {
  const matches: OpeningLike[] = []
  for (const el of sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement)) {
    if (jsxPathOf(el.compilerNode) === jsxPath) matches.push(el)
  }
  for (const el of sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)) {
    if (jsxPathOf(el.compilerNode) === jsxPath) matches.push(el)
  }
  if (matches.length <= 1) return matches[0]
  return (
    matches.find((el) => sourceFile.getLineAndColumnAtPos(el.getStart()).line === line) ??
    matches[0]
  )
}

/** Rewrite a string-literal inline-style value on the target element only. */
function rewriteInlineStyleOn(
  opening: OpeningLike,
  property: string,
  value: string,
  varName: string,
): boolean {
  for (const pa of opening.getDescendantsOfKind(SyntaxKind.PropertyAssignment)) {
    if (pa.getName() !== property) continue
    const init = pa.getInitializer()
    if (!init || init.getKind() !== SyntaxKind.StringLiteral) continue
    const literal = init.asKindOrThrow(SyntaxKind.StringLiteral)
    const text = literal.getLiteralText()
    if (text === value) {
      replaceStringLiteralValue(literal, `var(${varName})`)
      return true
    }
    // Compound/shorthand value (e.g. "1px solid #707883"): replace only the
    // observed color token, preserving the width/style around it.
    if (text.includes(value)) {
      replaceStringLiteralValue(literal, text.replace(value, `var(${varName})`))
      return true
    }
  }
  return false
}

/** Rewrite one className token on the target element only. */
function rewriteClassNameTokenOn(
  opening: OpeningLike,
  oldToken: string,
  newToken: string,
): boolean {
  const attr = getNamedAttribute(opening, 'className')
  if (!attr) return false
  const init = attr.getInitializer()
  if (!init) return false

  const replaceIn = (lit: Node): boolean => {
    const raw = (lit as Node & { getLiteralText(): string }).getLiteralText()
    const tokens = raw.split(/\s+/)
    const idx = tokens.indexOf(oldToken)
    if (idx === -1) return false
    tokens[idx] = newToken
    replaceStringLiteralValue(lit, tokens.join(' '))
    return true
  }

  // className="..."
  if (init.getKind() === SyntaxKind.StringLiteral) {
    return replaceIn(init.asKindOrThrow(SyntaxKind.StringLiteral))
  }
  // className={'...'}
  if (init.getKind() === SyntaxKind.JsxExpression) {
    const inner = init.asKindOrThrow(SyntaxKind.JsxExpression).getExpression()
    if (inner && inner.getKind() === SyntaxKind.StringLiteral) {
      return replaceIn(inner.asKindOrThrow(SyntaxKind.StringLiteral))
    }
  }
  return false
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

      const opening = observed.jsxPath
        ? findOpeningAt(sourceFile, observed.jsxPath, observed.line)
        : undefined
      if (!opening) {
        warn(
          `could not locate element at ${observed.jsxPath || '(no path)'} for ${observed.role}=${observed.value} in ${observed.file}`,
        )
        continue
      }

      if (observed.source.kind === 'inline-style') {
        if (!rewriteInlineStyleOn(opening, observed.source.property, observed.value, varName)) {
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
        if (!rewriteClassNameTokenOn(opening, oldToken, newToken)) {
          warn(`could not rewrite tailwind-arbitrary ${oldToken} in ${observed.file}`)
        }
        continue
      }

      if (observed.source.kind === 'tailwind-named') {
        const prefix = tailwindPrefixForRole(role) ?? observed.source.prefix
        const oldToken = observed.source.className
        const newToken = `${prefix}-[var(${varName})]`
        if (!rewriteClassNameTokenOn(opening, oldToken, newToken)) {
          warn(`could not rewrite tailwind-named ${oldToken} in ${observed.file}`)
        }
      }
    }
  }
}
