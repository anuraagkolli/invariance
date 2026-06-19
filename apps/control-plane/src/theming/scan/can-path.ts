// apps/control-plane/src/theming/scan/can-path.ts
import type { AppManifest } from "@invariance/theming";
import { SHADCN_CAN } from "@invariance/theming";

/**
 * The shadcn "can" path (spec §1.1 / §5): for a shadcn app, variables/formats/
 * modes are known in advance, so the prebuilt manifest skips scan-and-confirm —
 * the near-zero-touch path and the v1 demo path. We return a deep copy of the
 * shared SHADCN_CAN fixture with the caller's appId stamped, so callers never
 * mutate the shared constant.
 */
export function getCanManifest(appId: string): AppManifest {
  const copy = structuredClone(SHADCN_CAN);
  copy.appId = appId;
  return copy;
}
