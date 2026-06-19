// packages/theming/src/artifact/pointer.ts
import { z } from "zod";

// The data-plane contract (§7.3). KV: tenant → Pointer. Publish and kill-switch are
// BOTH a pointer write. A pointer MISS (no key → null from the store) is distinct from
// status:"disabled"; both resolve to base but are distinct telemetry events (Plan 07).
export const Pointer = z.object({
  hash: z.string(),
  status: z.enum(["live", "disabled"]),
  updatedAt: z.string(), // ISO timestamp — stamped outside any pure core
});

export type Pointer = z.infer<typeof Pointer>;
