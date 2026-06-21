// Control-plane theming stages are NOT re-exported from the control-plane public barrel
// (that barrel exports the legacy business-logic plane). The verification suite drives the
// real stages, so it imports them by relative source path. vitest transpiles the TS source
// directly; engine/control-plane source is untouched.

export {
  runTurn,
  acknowledge,
  resetToPublished,
  resetToAppDefault,
  APP_DEFAULT_SPEC,
} from "../../apps/control-plane/src/theming/authoring/session.js";
export type { Session, TurnResult } from "../../apps/control-plane/src/theming/authoring/session.js";

export { MockAgent } from "../../apps/control-plane/src/theming/authoring/mock-agent.js";

export { publish, setKillSwitch } from "../../apps/control-plane/src/theming/publish/publisher.js";
export type { PublishInput, PublishStores } from "../../apps/control-plane/src/theming/publish/publisher.js";

export {
  InMemoryBlobStore,
  InMemoryPointerStore,
  InMemoryAuditStore,
} from "../../apps/control-plane/src/theming/publish/stores.js";
export type { AuditRow, PublishedRecord } from "../../apps/control-plane/src/theming/publish/stores.js";

export { resolveThemeTag } from "../../apps/control-plane/src/theming/delivery/resolve-theme-tag.js";
export type {
  FailOpenReason,
  ResolveThemeTagArgs,
} from "../../apps/control-plane/src/theming/delivery/resolve-theme-tag.js";
