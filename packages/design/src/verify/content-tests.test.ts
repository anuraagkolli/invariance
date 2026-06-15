import { describe, it, expect } from 'vitest'
import {
  textNonEmpty,
  noXssVectors,
  imagesHaveAlt,
  textLengthBounded,
} from './content-tests'
import type { ContentSection } from '../config/types'

function content(pages: ContentSection['pages']): ContentSection {
  return { pages }
}

describe('textNonEmpty', () => {
  it('passes with non-empty text', () => {
    expect(textNonEmpty(content({ '/': { h: { text: 'Hello' } } })).passed).toBe(true)
  })

  it('fails when text is empty string', () => {
    const r = textNonEmpty(content({ '/': { h: { text: '' } } }))
    expect(r.passed).toBe(false)
    expect(r.message).toContain('/.h')
  })

  it('fails on whitespace-only text', () => {
    expect(textNonEmpty(content({ '/': { h: { text: '   ' } } })).passed).toBe(false)
  })

  it('ignores entries without text field', () => {
    expect(
      textNonEmpty(content({ '/': { img: { src: 'x.png', alt: 'x' } } })).passed,
    ).toBe(true)
  })
})

describe('noXssVectors', () => {
  const patterns = [
    '<script>alert(1)</script>',
    'x onclick=alert(1)',
    'img onerror=bad()',
    'body onload=x',
    'javascript:evil',
    'eval(42)',
    'document.cookie',
  ]

  for (const p of patterns) {
    it(`detects: ${p}`, () => {
      expect(noXssVectors(content({ '/': { e: { text: p } } })).passed).toBe(false)
    })
  }

  it('passes for benign text', () => {
    expect(noXssVectors(content({ '/': { e: { text: 'Hello world' } } })).passed).toBe(true)
  })

  it('scans src fields too', () => {
    expect(
      noXssVectors(content({ '/': { e: { src: 'javascript:void(0)', alt: 'x' } } })).passed,
    ).toBe(false)
  })
})

describe('imagesHaveAlt', () => {
  it('passes when alt is present', () => {
    expect(
      imagesHaveAlt(content({ '/': { i: { src: 'x.png', alt: 'desc' } } })).passed,
    ).toBe(true)
  })

  it('fails when alt is missing', () => {
    expect(
      imagesHaveAlt(content({ '/': { i: { src: 'x.png' } } })).passed,
    ).toBe(false)
  })

  it('fails when alt is whitespace-only', () => {
    expect(
      imagesHaveAlt(content({ '/': { i: { src: 'x.png', alt: '   ' } } })).passed,
    ).toBe(false)
  })

  it('ignores text-only entries', () => {
    expect(imagesHaveAlt(content({ '/': { t: { text: 'hi' } } })).passed).toBe(true)
  })
})

describe('textLengthBounded', () => {
  it('passes for short text', () => {
    expect(textLengthBounded(content({ '/': { t: { text: 'hi' } } })).passed).toBe(true)
  })

  it('fails for text over 10000 chars', () => {
    const huge = 'x'.repeat(10001)
    expect(textLengthBounded(content({ '/': { t: { text: huge } } })).passed).toBe(false)
  })
})
