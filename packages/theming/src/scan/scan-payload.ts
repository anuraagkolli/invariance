// packages/theming/src/scan/scan-payload.ts
import { z } from "zod";

/**
 * The shared scan contract (spec §5). Produced by the in-browser scan SDK
 * (packages/client/src/theming/scan-sdk) and consumed by the control-plane
 * Scanner (apps/control-plane/src/theming/scan). Lives in @invariance/theming
 * so BOTH planes parse the identical zod schema.
 *
 * "Consumption dictates, held cross-checks": `consumption[*].wrapping` is the
 * emit obligation at a use-site; `declarations[*].heldFormat` is the cross-check.
 * CSSOM is the source of truth; getComputedStyle is corroboration.
 */
export const ScanPayload = z.object({
  scanVersion: z.number(),
  origin: z.string(),
  variables: z.array(
    z.object({
      name: z.string(), // VarName — includes the leading "--"
      declarations: z.array(
        z.object({
          selector: z.string(), // ":root" | ".dark" | "[data-theme='dark']" | …
          mode: z.enum(["light", "dark", "unknown"]), // inferred from selector
          rawValue: z.string(), // held / as-authored, e.g. "0 0% 100%"
          heldFormat: z.enum([
            "hsl-triple",
            "rgb-triple",
            "hex",
            "oklch",
            "number",
            "keyword",
            "unknown",
          ]),
        }),
      ),
    }),
  ),
  consumption: z.record(
    z.string(), // VarName
    z.array(
      z.object({
        wrapping: z.enum(["hsl", "rgb", "oklch", "raw", "color-mix", "other"]),
        selector: z.string(),
        property: z.string(),
      }),
    ),
  ),
  opaqueSheets: z.array(z.string()), // cross-origin sheets that threw SecurityError on .cssRules
});

export type ScanPayload = z.infer<typeof ScanPayload>;
