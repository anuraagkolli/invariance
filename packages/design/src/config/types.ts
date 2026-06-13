// Back-compat re-export. The theme.json + config types moved to
// @invariance/design-schema; this stub keeps the old config-local import path working.
export { isV2Theme } from '@invariance/design-schema'
export type {
  InvarianceConfig, ThemeCssVars, ThemeGlobals, ThemeSection, ContentEntry,
  ContentSection, LayoutPage, LayoutSection, ComponentSelection,
  ComponentsSection, ThemeJson, ThemeSectionV2, ThemeJsonV2, AnyThemeJson,
} from '@invariance/design-schema'
