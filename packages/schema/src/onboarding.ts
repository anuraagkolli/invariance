import { z } from "zod";
import { HttpMethodSchema } from "./manifest";

/**
 * Onboarding (the developer-time scanner pipeline). When a developer connects a
 * repo, the control plane scans it and proposes a governable surface: the app's
 * page archetypes, the named sections end users may customize (with suggested
 * levels), the role-token palette seeded from observed colors, and — read-only
 * for now — the API endpoints the business-logic plane could govern.
 *
 * Nothing here is load-bearing for safety: the developer reviews and edits the
 * plan, then `finalize` turns it into a reviewable AppManifest + design-config.
 * See docs ONBOARDING-PIPELINE.md.
 */

/** A role token (color/typography/…) seeded from the app's observed palette. */
export const OnboardingTokenSchema = z.object({
  /** Role-token name, e.g. "--inv-accent". */
  role: z.string().min(1),
  /** Compiled/observed default value (hex for colors). */
  value: z.string().min(1),
  kind: z.enum(["color", "typography", "radius", "shadow", "spacing", "other"]),
  /** Developer pinned this value — end users may not change it. */
  locked: z.boolean().default(false),
  /** How many call sites observed this color (salience for the wizard). */
  usage: z.number().int().nonnegative().default(0),
  /** Surfaced as an editable swatch in the wizard (vs. declared-only). */
  salient: z.boolean().default(false),
});
export type OnboardingToken = z.infer<typeof OnboardingTokenSchema>;

/** A font family observed in the app, with a guessed typographic role. */
export const OnboardingFontSchema = z.object({
  family: z.string().min(1),
  role: z.enum(["heading", "body", "mono", "unknown"]).default("unknown"),
  usage: z.number().int().nonnegative().default(0),
});
export type OnboardingFont = z.infer<typeof OnboardingFontSchema>;

/** One customizable section of a page archetype (becomes an m.slot). */
export const OnboardingSectionSchema = z.object({
  /** Stable id within the plan, e.g. "home:1". */
  id: z.string().min(1),
  /** Semantic slot name (developer-editable), e.g. "hero". */
  name: z.string().min(1),
  /** Suggested customization level on the 0–4 ladder (0 = locked). */
  level: z.number().int().min(0).max(4),
  /** Alternate names end users may say (Gatekeeper disambiguation). */
  aliases: z.array(z.string()).default([]),
  /** JSX tag the section was segmented from ("section", "nav", "div"…). */
  tagName: z.string(),
  /** Dotted jsxPath from the page root, e.g. "div>main>section[1]". */
  jsxPath: z.string(),
  /** Index among the page's content-container element children — the preview
   *  bridge highlights `container > :nth-of-type(domIndex+1)`. */
  domIndex: z.number().int().nonnegative(),
  file: z.string(),
  line: z.number().int().nonnegative().default(0),
  /** Short opening-tag snippet for developer context. */
  snippet: z.string().default(""),
  /** Distinct colors observed inside this section (for the preview). */
  colors: z.array(z.string()).default([]),
  description: z.string().optional(),
});
export type OnboardingSection = z.infer<typeof OnboardingSectionSchema>;

/** A page archetype: one route pattern → one shared template → one key. */
export const OnboardingArchetypeSchema = z.object({
  /** Route pattern (the customization key), e.g. "/title/[id]". */
  key: z.string().min(1),
  /** A representative concrete route for the live preview, e.g. "/". */
  route: z.string().min(1),
  pageFile: z.string(),
  /** Default customization level for the whole archetype. */
  defaultLevel: z.number().int().min(0).max(4),
  sections: z.array(OnboardingSectionSchema).default([]),
});
export type OnboardingArchetype = z.infer<typeof OnboardingArchetypeSchema>;

/** A detected API endpoint (read-only in this round of onboarding). */
export const OnboardingEndpointSchema = z.object({
  method: HttpMethodSchema,
  path: z.string().min(1),
  file: z.string(),
});
export type OnboardingEndpoint = z.infer<typeof OnboardingEndpointSchema>;

export const OnboardingPlanSchema = z.object({
  appId: z.string().min(1),
  repo: z.object({
    source: z.enum(["url", "path"]),
    ref: z.string(),
  }),
  packageName: z.string().nullable().default(null),
  frameworks: z.object({
    react: z.boolean(),
    next: z.boolean(),
    express: z.boolean(),
  }),
  archetypes: z.array(OnboardingArchetypeSchema).default([]),
  /** Salient + declared role tokens surfaced to the wizard. */
  tokens: z.array(OnboardingTokenSchema).default([]),
  /** The full compiled role-token map (all ~38), declared into the manifest. */
  roles: z.record(z.string()).default({}),
  fonts: z.array(OnboardingFontSchema).default([]),
  endpoints: z.array(OnboardingEndpointSchema).default([]),
  warnings: z.array(z.string()).default([]),
});
export type OnboardingPlan = z.infer<typeof OnboardingPlanSchema>;

export const OnboardingStatusSchema = z.enum([
  "scanning",
  "ready",
  "finalizing",
  "finalized",
  "error",
]);
export type OnboardingStatus = z.infer<typeof OnboardingStatusSchema>;

export const OnboardingSessionSchema = z.object({
  sessionId: z.string().min(1),
  appId: z.string().min(1),
  status: OnboardingStatusSchema,
  plan: OnboardingPlanSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  error: z.string().optional(),
  finalized: z
    .object({ manifestVersion: z.string(), staleMods: z.number() })
    .optional(),
});
export type OnboardingSession = z.infer<typeof OnboardingSessionSchema>;

/** Partial edits the wizard PATCHes back as the developer reviews the plan. */
export const OnboardingPatchSchema = z.object({
  sections: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1).optional(),
        level: z.number().int().min(0).max(4).optional(),
        aliases: z.array(z.string()).optional(),
      }),
    )
    .optional(),
  archetypes: z
    .array(
      z.object({
        key: z.string().min(1),
        defaultLevel: z.number().int().min(0).max(4).optional(),
      }),
    )
    .optional(),
  tokens: z
    .array(
      z.object({
        role: z.string().min(1),
        locked: z.boolean().optional(),
        value: z.string().min(1).optional(),
      }),
    )
    .optional(),
});
export type OnboardingPatch = z.infer<typeof OnboardingPatchSchema>;
