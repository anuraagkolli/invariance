import { describe, it, expect } from 'vitest'
import { Project } from 'ts-morph'
import { extractColors } from './extract-colors'
import type { TailwindMaps } from '../types'

function parse(source: string) {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { jsx: 4, allowJs: true },
  })
  return project.createSourceFile('test.tsx', source)
}

function emptyTailwind(): TailwindMaps {
  return {
    colors: new Map(),
    fonts: new Map(),
    spacing: new Map(),
    loaded: false,
  }
}

describe('extractColors — inline style', () => {
  it('extracts backgroundColor hex from inline style', () => {
    const sf = parse(`
      export default function P() {
        return <div style={{ backgroundColor: '#1a1a2e' }} />
      }
    `)
    const values = extractColors(sf, emptyTailwind())
    expect(values).toHaveLength(1)
    expect(values[0]).toMatchObject({ role: 'bg', value: '#1a1a2e' })
  })

  it('extracts color (text role) from inline style', () => {
    const sf = parse(`
      export default function P() {
        return <p style={{ color: '#ffffff' }} />
      }
    `)
    const values = extractColors(sf, emptyTailwind())
    expect(values[0]?.role).toBe('text')
  })

  it('extracts borderColor as border role', () => {
    const sf = parse(`
      export default function P() {
        return <p style={{ borderColor: '#e5e7eb' }} />
      }
    `)
    const values = extractColors(sf, emptyTailwind())
    expect(values[0]?.role).toBe('border')
  })

  it('ignores non-color style properties', () => {
    const sf = parse(`
      export default function P() {
        return <div style={{ padding: '16px', width: '100%' }} />
      }
    `)
    expect(extractColors(sf, emptyTailwind())).toHaveLength(0)
  })

  it('ignores non-color-literal values', () => {
    const sf = parse(`
      export default function P() {
        return <div style={{ backgroundColor: 'var(--whatever)' }} />
      }
    `)
    expect(extractColors(sf, emptyTailwind())).toHaveLength(0)
  })
})

describe('extractColors — tailwind arbitrary values', () => {
  it('extracts bg-[#hex] class', () => {
    const sf = parse(`
      export default function P() {
        return <div className="bg-[#1a1a2e] text-[#ffffff]" />
      }
    `)
    const values = extractColors(sf, emptyTailwind())
    expect(values).toHaveLength(2)
    expect(values.find((v) => v.role === 'bg')?.value).toBe('#1a1a2e')
    expect(values.find((v) => v.role === 'text')?.value).toBe('#ffffff')
  })

  it('extracts border-[#hex] as border role', () => {
    const sf = parse(`
      export default function P() {
        return <div className="border-[#e5e7eb]" />
      }
    `)
    const values = extractColors(sf, emptyTailwind())
    expect(values[0]?.role).toBe('border')
    expect(values[0]?.source.kind).toBe('tailwind-arbitrary')
  })

  it('ignores non-color arbitrary values', () => {
    const sf = parse(`
      export default function P() {
        return <div className="bg-[url(bg.png)]" />
      }
    `)
    expect(extractColors(sf, emptyTailwind())).toHaveLength(0)
  })
})

describe('extractColors — named tailwind classes', () => {
  it('resolves named class via tailwind map', () => {
    const tw: TailwindMaps = {
      colors: new Map([['bg-blue-900', '#1e3a8a']]),
      fonts: new Map(),
      spacing: new Map(),
      loaded: true,
    }
    const sf = parse(`
      export default function P() {
        return <div className="bg-blue-900" />
      }
    `)
    const values = extractColors(sf, tw)
    expect(values[0]?.value).toBe('#1e3a8a')
    expect(values[0]?.source.kind).toBe('tailwind-named')
  })

  it('ignores border-<n> width classes (not colors)', () => {
    const sf = parse(`
      export default function P() {
        return <div className="border-2" />
      }
    `)
    expect(extractColors(sf, emptyTailwind())).toHaveLength(0)
  })

  it('skips named classes not in the tailwind map', () => {
    const sf = parse(`
      export default function P() {
        return <div className="bg-unknown-thing" />
      }
    `)
    expect(extractColors(sf, emptyTailwind())).toHaveLength(0)
  })
})
