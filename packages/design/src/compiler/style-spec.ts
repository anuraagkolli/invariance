// Back-compat re-export. The contracts moved to @invariance/design-schema; this stub
// keeps the old compiler-local import path working. Not `export *`: that would
// leak theme.json types into a compiler-namespaced path.
export { StyleSpecSchema, ACCENT_CHROMA, NEUTRAL_TINT_CHROMA, CONTRAST_TARGETS } from '@invariance/design-schema'
export type { StyleSpec, DesignConstraints } from '@invariance/design-schema'
