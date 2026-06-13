import { describe, it, expect } from 'vitest'
import path from 'path'
import { discoverApp } from './discover'

const NEBULA = path.resolve(__dirname, '__fixtures__/nebula-clean')

describe('discoverApp — globals.css', () => {
  it('locates globals.css next to the layout', async () => {
    const d = await discoverApp(NEBULA)
    expect(d.globalsCssFile).not.toBeNull()
    expect(d.globalsCssFile?.endsWith(path.join('src', 'app', 'globals.css'))).toBe(true)
  })
})
