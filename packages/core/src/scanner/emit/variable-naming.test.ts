import { describe, expect, it } from 'vitest'

import { cssVarFor, kebab, roleForCssProperty } from './variable-naming'

describe('kebab', () => {
  it('lowercases single-word input', () => {
    expect(kebab('Sidebar')).toBe('sidebar')
  })

  it('lowercases and hyphenates camelCase', () => {
    expect(kebab('sidebarNav')).toBe('sidebar-nav')
    expect(kebab('HeaderLogo')).toBe('header-logo')
    expect(kebab('sidebarBackground')).toBe('sidebar-background')
  })

  it('collapses whitespace and underscores to single hyphens', () => {
    expect(kebab('deals  grid')).toBe('deals-grid')
    expect(kebab('deals__grid')).toBe('deals-grid')
    expect(kebab('deals grid_card')).toBe('deals-grid-card')
    expect(kebab('main_content area')).toBe('main-content-area')
  })

  it('strips disallowed characters and trims leading/trailing hyphens', () => {
    expect(kebab('--sidebar--')).toBe('sidebar')
    expect(kebab('foo!@#bar')).toBe('foo-bar')
    expect(kebab('side/bar!')).toBe('side-bar')
    expect(kebab('-abc-')).toBe('abc')
  })

  it('collapses consecutive dashes/underscores', () => {
    expect(kebab('a--b___c')).toBe('a-b-c')
  })
})

describe('cssVarFor', () => {
  it('produces deterministic --inv-{slot}-{role} names', () => {
    expect(cssVarFor('sidebar', 'bg')).toBe('--inv-sidebar-bg')
    expect(cssVarFor('header', 'border')).toBe('--inv-header-border')
    expect(cssVarFor('dealsGrid', 'text')).toBe('--inv-deals-grid-text')
  })

  it('kebab-cases the slot name', () => {
    expect(cssVarFor('mainContent', 'text')).toBe('--inv-main-content-text')
  })

  it('appends a collision suffix when provided', () => {
    expect(cssVarFor('sidebar', 'bg', 1)).toBe('--inv-sidebar-bg-1')
    expect(cssVarFor('sidebar', 'bg', 2)).toBe('--inv-sidebar-bg-2')
  })

  it('omits the suffix when zero or undefined', () => {
    expect(cssVarFor('sidebar', 'bg', 0)).toBe('--inv-sidebar-bg')
    expect(cssVarFor('sidebar', 'bg', undefined)).toBe('--inv-sidebar-bg')
    expect(cssVarFor('sidebar', 'bg')).toBe('--inv-sidebar-bg')
  })

  it('falls back to kebab form for unknown roles', () => {
    expect(cssVarFor('sidebar', 'accentColor')).toBe('--inv-sidebar-accent-color')
    expect(cssVarFor('sidebar', 'customRole')).toBe('--inv-sidebar-custom-role')
  })
})

describe('roleForCssProperty', () => {
  it('maps background properties to bg', () => {
    expect(roleForCssProperty('backgroundColor')).toBe('bg')
    expect(roleForCssProperty('background')).toBe('bg')
  })

  it('maps color to text and fontFamily to font', () => {
    expect(roleForCssProperty('color')).toBe('text')
    expect(roleForCssProperty('fontFamily')).toBe('font')
  })

  it('maps border color variants to border', () => {
    expect(roleForCssProperty('borderColor')).toBe('border')
    expect(roleForCssProperty('border')).toBe('border')
    expect(roleForCssProperty('borderTopColor')).toBe('border')
  })

  it('maps padding and margin properties', () => {
    expect(roleForCssProperty('padding')).toBe('pad')
    expect(roleForCssProperty('paddingLeft')).toBe('pad')
    expect(roleForCssProperty('margin')).toBe('margin')
    expect(roleForCssProperty('marginTop')).toBe('margin')
  })

  it('maps borderRadius to radius', () => {
    expect(roleForCssProperty('borderRadius')).toBe('radius')
  })

  it('returns null for unknown properties', () => {
    expect(roleForCssProperty('opacity')).toBeNull()
    expect(roleForCssProperty('zIndex')).toBeNull()
    expect(roleForCssProperty('display')).toBeNull()
  })
})
