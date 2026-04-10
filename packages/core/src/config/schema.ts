import { z } from 'zod'

// ---------------------------------------------------------------------------
// Invariant config schema (parsed from YAML)
// ---------------------------------------------------------------------------

const ColorsConfigSchema = z.union([
  z.object({ mode: z.literal('any') }),
  z.object({
    mode: z.literal('palette'),
    palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(1),
  }),
])

const FontsConfigSchema = z.object({
  allowed: z.array(z.string().min(1)).min(1),
})

const SpacingConfigSchema = z.object({
  scale: z.array(z.number().nonnegative()).min(1),
})

const DesignConfigSchema = z.object({
  colors: ColorsConfigSchema.optional(),
  fonts: FontsConfigSchema.optional(),
  spacing: SpacingConfigSchema.optional(),
})

const StructureConfigSchema = z.object({
  required_sections: z.array(z.string()).optional(),
  locked_sections: z.array(z.string()).optional(),
  section_order: z.object({
    first: z.string().optional(),
    last: z.string().optional(),
  }).optional(),
})

const AccessibilityConfigSchema = z.object({
  wcag_level: z.union([z.literal('AA'), z.literal('AAA')]).optional(),
  color_contrast: z.string().optional(),
  all_images: z.string().optional(),
})

const PageConfigSchema = z.object({
  level: z.number().int().min(0).max(7),
  required: z.array(z.string()).optional(),
})

const FrontendConfigSchema = z.object({
  design: DesignConfigSchema.optional(),
  structure: StructureConfigSchema.optional(),
  accessibility: AccessibilityConfigSchema.optional(),
  pages: z.record(z.string(), PageConfigSchema).optional(),
})

export const InvarianceConfigSchema = z.object({
  app: z.string().min(1),
  frontend: FrontendConfigSchema.optional(),
})

// ---------------------------------------------------------------------------
// theme.json schema
// ---------------------------------------------------------------------------

const ThemeColorsSchema = z.record(z.string(), z.string().regex(/^#[0-9a-fA-F]{6}$/))

const ThemeFontsSchema = z.record(z.string(), z.string())

const ThemeSpacingSchema = z.object({
  unit: z.number().int().positive(),
  scale: z.array(z.number().int().nonnegative()),
})

const ThemeRadiiSchema = z.record(z.string(), z.number().nonnegative())

// Accepts structured keys (colors/fonts/spacing/radii) plus arbitrary --inv-*
// CSS variable keys written by the scanner during migration. Unknown
// non-CSS-var keys are stripped; bad --inv-* values fail.
const CSS_VAR_KEY = /^--inv-[a-z0-9-]+$/
const ThemeGlobalsSchema = z
  .object({
    colors: ThemeColorsSchema.optional(),
    fonts: ThemeFontsSchema.optional(),
    spacing: ThemeSpacingSchema.optional(),
    radii: ThemeRadiiSchema.optional(),
  })
  .catchall(z.string())
  .superRefine((val, ctx) => {
    for (const key of Object.keys(val)) {
      if (key === 'colors' || key === 'fonts' || key === 'spacing' || key === 'radii') continue
      if (!CSS_VAR_KEY.test(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `theme.globals keys must be 'colors'|'fonts'|'spacing'|'radii' or match ${CSS_VAR_KEY}`,
        })
      }
    }
  })

const SlotStylesSchema = z.record(z.string(), z.string())
const ThemeSlotsSchema = z.record(z.string(), SlotStylesSchema)

const ThemeSectionSchema = z.object({
  globals: ThemeGlobalsSchema.optional(),
  slots: ThemeSlotsSchema.optional(),
})

const ContentEntrySchema = z.union([
  z.object({ text: z.string().min(1) }),
  z.object({ src: z.string(), alt: z.string().min(1) }),
])

const ContentSectionSchema = z.object({
  pages: z.record(z.string(), z.record(z.string(), ContentEntrySchema)),
})

const LayoutPageSchema = z.object({
  sections: z.array(z.string()).optional(),
  hidden: z.array(z.string()).optional(),
}).catchall(z.unknown())

const LayoutSectionSchema = z.object({
  pages: z.record(z.string(), LayoutPageSchema),
})

const ComponentSelectionSchema = z.object({
  component: z.string(),
  props: z.record(z.string(), z.unknown()).optional(),
})

const ComponentsSectionSchema = z.object({
  pages: z.record(z.string(), z.record(z.string(), ComponentSelectionSchema)),
})

export const ThemeJsonSchema = z.object({
  version: z.number().int().positive(),
  base_app_version: z.string(),
  theme: ThemeSectionSchema.optional(),
  content: ContentSectionSchema.optional(),
  layout: LayoutSectionSchema.optional(),
  components: ComponentsSectionSchema.optional(),
})
