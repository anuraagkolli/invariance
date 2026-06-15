import type { InvarianceConfig, ThemeJson } from '../../config/types'
import type { SlotRegistration } from '../../context/registry'

export function mockConfig(overrides: Partial<InvarianceConfig['frontend']> = {}): InvarianceConfig {
  return {
    app: 'test-app',
    frontend: {
      design: {
        colors: { mode: 'palette', palette: ['#ffffff', '#000000', '#ff0000'] },
        fonts: { allowed: ['Inter', 'system-ui'] },
        spacing: { scale: [0, 4, 8, 16, 32] },
      },
      structure: {
        required_sections: ['header', 'main'],
        locked_sections: ['auth-gate'],
        section_order: { first: 'header', last: 'footer' },
      },
      accessibility: { wcag_level: 'AA' },
      ...overrides,
    },
  }
}

export function mockTheme(overrides: Partial<ThemeJson> = {}): ThemeJson {
  return {
    version: 1,
    base_app_version: 'v1',
    theme: { globals: {}, slots: {} },
    ...overrides,
  }
}

export function mockSlot(name: string, overrides: Partial<SlotRegistration> = {}): SlotRegistration {
  return {
    name,
    level: 1,
    pageName: '/test',
    preserve: false,
    alternativesCount: 0,
    type: 'slot',
    ...overrides,
  }
}
