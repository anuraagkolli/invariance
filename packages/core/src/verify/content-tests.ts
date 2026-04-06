import type { ContentSection } from '../config/types'
import type { TestResult } from './types'

export function textNonEmpty(content: ContentSection): TestResult {
  const violations: string[] = []

  for (const [page, elements] of Object.entries(content.pages)) {
    for (const [id, entry] of Object.entries(elements)) {
      if ('text' in entry && entry.text !== undefined && entry.text.trim() === '') {
        violations.push(`${page}.${id}`)
      }
    }
  }

  return {
    name: 'textNonEmpty',
    passed: violations.length === 0,
    message: violations.length === 0
      ? 'All text content non-empty'
      : `Empty text entries: ${violations.join(', ')}`,
    severity: 'error',
    autoFixable: false,
  }
}

const XSS_PATTERNS = [
  /<script/i,
  /onclick\s*=/i,
  /onerror\s*=/i,
  /onload\s*=/i,
  /javascript:/i,
  /eval\s*\(/i,
  /document\.cookie/i,
]

export function noXssVectors(content: ContentSection): TestResult {
  const violations: string[] = []

  for (const [page, elements] of Object.entries(content.pages)) {
    for (const [id, entry] of Object.entries(elements)) {
      const textValue = 'text' in entry ? entry.text : undefined
      const srcValue = 'src' in entry ? entry.src : undefined
      for (const value of [textValue, srcValue]) {
        if (!value) continue
        for (const pattern of XSS_PATTERNS) {
          if (pattern.test(value)) {
            violations.push(`${page}.${id}: matches ${pattern.source}`)
            break
          }
        }
      }
    }
  }

  return {
    name: 'noXssVectors',
    passed: violations.length === 0,
    message: violations.length === 0
      ? 'No XSS vectors found'
      : `XSS vectors detected: ${violations.join(', ')}`,
    severity: 'error',
    autoFixable: false,
  }
}

export function imagesHaveAlt(content: ContentSection): TestResult {
  const violations: string[] = []

  for (const [page, elements] of Object.entries(content.pages)) {
    for (const [id, entry] of Object.entries(elements)) {
      if ('src' in entry && entry.src !== undefined) {
        if (!entry.alt || entry.alt.trim() === '') {
          violations.push(`${page}.${id}`)
        }
      }
    }
  }

  return {
    name: 'imagesHaveAlt',
    passed: violations.length === 0,
    message: violations.length === 0
      ? 'All images have alt text'
      : `Images missing alt text: ${violations.join(', ')}`,
    severity: 'error',
    autoFixable: false,
  }
}

export function textLengthBounded(content: ContentSection): TestResult {
  const MAX_LENGTH = 10000
  const violations: string[] = []

  for (const [page, elements] of Object.entries(content.pages)) {
    for (const [id, entry] of Object.entries(elements)) {
      if ('text' in entry && entry.text !== undefined && entry.text.length > MAX_LENGTH) {
        violations.push(`${page}.${id}: ${entry.text.length} chars`)
      }
    }
  }

  return {
    name: 'textLengthBounded',
    passed: violations.length === 0,
    message: violations.length === 0
      ? 'All text within length limits'
      : `Text too long: ${violations.join(', ')}`,
    severity: 'warning',
    autoFixable: false,
  }
}
