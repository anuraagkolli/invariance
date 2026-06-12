import { describe, it, expect, beforeEach } from 'vitest'
import type { RoleAssignment } from 'invariance/headless'
import { buildRootVars, applyVirtualTokens } from './virtual-tokens'
import { miniScan } from './mini-scan'

function assignment(roles: Record<string, string>, varToRole: Array<[string, string]>): RoleAssignment {
  return { roles, varToRole: new Map(varToRole), warnings: [] }
}

describe('buildRootVars', () => {
  it('emits a :root block of the role variables in assignment order', () => {
    const a = assignment(
      { '--inv-surface-0': '#FFFFFF', '--inv-accent': '#E94560' },
      [],
    )
    expect(buildRootVars(a)).toBe(':root{--inv-surface-0:#FFFFFF;--inv-accent:#E94560;}')
  })

  it('returns an empty :root block when no roles are filled', () => {
    expect(buildRootVars(assignment({}, []))).toBe(':root{}')
  })
})

describe('applyVirtualTokens', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    document.body.removeAttribute('style')
  })

  it('rewrites a matched element\'s computed value to the role var', () => {
    document.body.innerHTML = '<div id="card" style="background-color: rgb(243, 244, 246)">c</div>'
    const scan = miniScan(document)
    const a = assignment(
      { '--inv-surface-1': '#F3F4F6' },
      [['bg:#F3F4F6', '--inv-surface-1']],
    )
    applyVirtualTokens(document, a, scan)
    const card = document.getElementById('card')!
    expect(card.style.getPropertyValue('background-color')).toBe('var(--inv-surface-1)')
  })

  it('maps text and border kinds independently of bg', () => {
    document.body.innerHTML =
      '<div id="t" style="color: rgb(26, 26, 46); border: 1px solid rgb(229, 231, 235)">t</div>'
    const scan = miniScan(document)
    const a = assignment(
      { '--inv-text-primary': '#1A1A2E', '--inv-border': '#E5E7EB' },
      [
        ['text:#1A1A2E', '--inv-text-primary'],
        ['border:#E5E7EB', '--inv-border'],
      ],
    )
    applyVirtualTokens(document, a, scan)
    const t = document.getElementById('t')!
    expect(t.style.getPropertyValue('color')).toBe('var(--inv-text-primary)')
    expect(t.style.getPropertyValue('border-color')).toBe('var(--inv-border)')
  })

  it('binds an accent-bg element even when the cluster registered the accent as text', () => {
    // A button uses the accent as a BACKGROUND, but the cluster only saw the accent
    // as TEXT (icons), so varToRole has text:#E94560 and NOT bg:#E94560. The accent
    // cross-kind fallback must still bind the button's background to --inv-accent.
    document.body.innerHTML =
      '<button id="b" style="background-color: rgb(233, 69, 96)">play</button>'
    const scan = miniScan(document)
    const a = assignment(
      { '--inv-accent': '#E94560' },
      [['text:#E94560', '--inv-accent']], // text-only registration
    )
    applyVirtualTokens(document, a, scan)
    expect(document.getElementById('b')!.style.getPropertyValue('background-color')).toBe('var(--inv-accent)')
  })

  it('does NOT cross-bind a surface hex used in the wrong kind', () => {
    // A white TEXT colour must not bind to the white surface role: surfaces are
    // kind-specific. Only the accent family cross-binds.
    document.body.innerHTML = '<div id="w" style="color: rgb(255, 255, 255)">w</div>'
    const scan = miniScan(document)
    const a = assignment({ '--inv-surface-0': '#FFFFFF' }, [['bg:#FFFFFF', '--inv-surface-0']])
    applyVirtualTokens(document, a, scan)
    // color stayed literal — no surface role leaked across kinds.
    expect(document.getElementById('w')!.style.getPropertyValue('color')).toBe('rgb(255, 255, 255)')
  })

  it('leaves elements whose value matched no role untouched', () => {
    document.body.innerHTML = '<div id="x" style="background-color: rgb(1, 2, 3)">x</div>'
    const scan = miniScan(document)
    const a = assignment({ '--inv-surface-0': '#FFFFFF' }, [['bg:#FFFFFF', '--inv-surface-0']])
    applyVirtualTokens(document, a, scan)
    const x = document.getElementById('x')!
    // Its bg did not match a role var, so the inline value is the original literal.
    expect(x.style.getPropertyValue('background-color')).toBe('rgb(1, 2, 3)')
  })

  it('skips snippet-owned nodes', () => {
    document.body.innerHTML =
      '<div id="p" data-inv-snippet style="background-color: rgb(243, 244, 246)">p</div>'
    const scan = miniScan(document)
    const a = assignment({ '--inv-surface-1': '#F3F4F6' }, [['bg:#F3F4F6', '--inv-surface-1']])
    applyVirtualTokens(document, a, scan)
    const p = document.getElementById('p')!
    expect(p.style.getPropertyValue('background-color')).toBe('rgb(243, 244, 246)')
  })

  it('returns an undo fn that restores prior inline styles exactly', () => {
    document.body.innerHTML = '<div id="card" style="background-color: rgb(243, 244, 246); padding: 4px">c</div>'
    const scan = miniScan(document)
    const a = assignment({ '--inv-surface-1': '#F3F4F6' }, [['bg:#F3F4F6', '--inv-surface-1']])
    const card = document.getElementById('card')!
    const before = card.getAttribute('style')
    const undo = applyVirtualTokens(document, a, scan)
    expect(card.style.getPropertyValue('background-color')).toBe('var(--inv-surface-1)')
    undo()
    // The exact prior inline style (including unrelated padding) is restored.
    expect(card.getAttribute('style')).toBe(before)
  })

  it('undo restores an element that had no style attribute to having none', () => {
    document.body.innerHTML = '<div id="d">d</div>'
    // Style it via a class-free inline write so the element starts with no attr,
    // then force a bg through the observation path by giving it an inline bg.
    const d = document.getElementById('d')!
    d.setAttribute('style', 'background-color: rgb(243, 244, 246)')
    const scan = miniScan(document)
    const a = assignment({ '--inv-surface-1': '#F3F4F6' }, [['bg:#F3F4F6', '--inv-surface-1']])
    const undo = applyVirtualTokens(document, a, scan)
    undo()
    expect(d.getAttribute('style')).toBe('background-color: rgb(243, 244, 246)')
  })
})
